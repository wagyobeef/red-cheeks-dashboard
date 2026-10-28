import { BrowserWindow, session } from 'electron'
import {
  applyWatcherFlags,
  buildAltBoard,
  chooseWatchingIds,
  isAltListingUrl,
  parseAuctionName,
  parseLiveAuctionCycleId,
  parseMyAuction,
  parseStytchSession,
  parseWatchToggle,
  parseWatcherFlags,
  watchingCandidates,
  type AltPlacement,
  type AltSnapshot,
  type ParsedAltLot
} from '../shared/alt'
import { parseMarketPrice, tokenExpired, tokenExpiry, type LoadStep } from '../shared/fanatics'
import { closeSignedInChrome, openSignedInChrome, type ChromeCookie, type SignedInSite } from './fanaticsChrome'
import { UserFacingError, logSafe } from './errors'
import {
  clearStoredAltSession,
  readAltNotes,
  readStoredAltSession,
  readWatchingSample,
  saveAltNote,
  saveStoredAltSession,
  saveWatchingSample
} from './altStore'

const PARTITION = 'persist:alt'
const API_URL = 'https://alt-platform-server.production.internal.onlyalt.com/graphql'
const LOGIN_URL = 'https://alt.xyz/login'
const SESSION_URL = 'https://api.stytch.com/sdk/v1/sessions/authenticate'
const PUBLIC_TOKEN = 'public-token-live-b46d695e-c943-4d41-809f-fe40b713fdc8'
const SESSION_COOKIE = 'stytch_session'
const JWT_COOKIE = 'stytch_session_jwt'
const WATCH_BATCH = 25
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const altChromeSite: SignedInSite = {
  id: 'alt',
  host: 'https://www.alt.xyz',
  domain: '.alt.xyz'
}

const AUCTION_CONTEXT = `
  query AltAuctionContext {
    liveAuctionCycle {
      auctionCycle { id }
    }
    currentAuctionCycle {
      auctionCycle { id }
    }
    auctionCycles {
      id
      name
    }
  }
`

const MY_AUCTION = `
  query MyAuction {
    myAuction {
      itemDetails { itemName }
      listingId
      status
      currentBid
      userMaxBid
      auctionCycleId
    }
  }
`

const WATCHERS = `
  query UniversalWatcherCounts($input: [UniversalWatcherCountInput!]!) {
    universalWatcherCounts(input: $input) {
      sourceId
      watching
    }
  }
`

const TOGGLE_WATCH = `
  mutation ToggleUniversalWatchlist($input: ToggleUnviersalWatchlistInput!) {
    toggleUnviersalWatchlist(input: $input) {
      result {
        watching
        sourceId
      }
      error {
        __typename
        ... on BaseApiError {
          message
        }
      }
    }
  }
`

type Report = (step: LoadStep) => void
type Cache = { lots: ParsedAltLot[]; cycleId: string | null; auctionName: string | null }

const quiet: Report = () => {}

let cache: Cache | null = null
let jwtCache: string | null = null
let refreshing: Promise<string> | null = null
let signInPromise: Promise<void> | null = null
let signInWindow: BrowserWindow | null = null

function altSession() {
  return session.fromPartition(PARTITION)
}

function clearBidCache(): void {
  cache = null
}

function clearSessionTokens(): void {
  jwtCache = null
  clearBidCache()
  clearStoredAltSession()
  void altSession()
    .clearStorageData()
    .catch((error) => logSafe(error))
  void closeSignedInChrome(altChromeSite)
}

export function hasStoredAltSession(): boolean {
  return readStoredAltSession() !== null
}

async function cookieValue(name: string): Promise<string | null> {
  const cookies = await Promise.race([
    Promise.all([
      altSession().cookies.get({ url: 'https://alt.xyz', name }),
      altSession().cookies.get({ url: 'https://www.alt.xyz', name })
    ]).then(([apex, www]) => [...apex, ...www]),
    delay(800).then(() => null)
  ])
  if (!cookies) return null
  const match = cookies.find((cookie) => cookie.value)
  return match?.value ?? null
}

async function pageCookie(win: BrowserWindow, name: string): Promise<string | null> {
  if (win.isDestroyed()) return null
  const url = win.webContents.getURL()
  if (!url.startsWith('https://www.alt.xyz') && !url.startsWith('https://alt.xyz')) return null
  try {
    const raw = await win.webContents.executeJavaScript('document.cookie', true)
    if (typeof raw !== 'string') return null
    const part = raw.split('; ').find((item) => item.startsWith(`${name}=`))
    return part ? decodeURIComponent(part.slice(name.length + 1)) : null
  } catch (error) {
    logSafe(error)
    return null
  }
}

function telemetryHeader(): string {
  const blob = {
    event_id: `event-id-${crypto.randomUUID()}`,
    app_session_id: `app-session-id-${crypto.randomUUID()}`,
    persistent_id: `persistent-id-${crypto.randomUUID()}`,
    client_sent_at: new Date().toISOString(),
    timezone: 'America/Los_Angeles',
    app: { identifier: 'alt.xyz' },
    sdk: { identifier: 'Stytch.js Javascript SDK', version: '5.40.0' }
  }
  return Buffer.from(JSON.stringify(blob)).toString('base64')
}

async function stytchAuthenticate(sessionToken: string): Promise<{ sessionToken: string; sessionJwt: string }> {
  const authorization = Buffer.from(`${PUBLIC_TOKEN}:${sessionToken}`).toString('base64')
  let response: Response
  try {
    response = await fetch(SESSION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
        'X-SDK-Client': telemetryHeader(),
        'X-SDK-Parent-Host': 'https://alt.xyz',
        Origin: 'https://alt.xyz',
        Referer: 'https://alt.xyz/'
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    logSafe(error)
    throw new UserFacingError('Alt could not be reached.')
  }

  const body = await response.json().catch(() => null)
  const next = parseStytchSession(body)
  if (response.status === 401 || response.status === 403) throw new UserFacingError('Sign in again to Alt.')
  if (!response.ok || !next) throw new UserFacingError('Alt could not be read.')
  return next
}

async function rememberSession(sessionToken: string, sessionJwt: string): Promise<void> {
  saveStoredAltSession(sessionToken)
  jwtCache = sessionJwt
  const expirationDate = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  await Promise.all(
    [
      [SESSION_COOKIE, sessionToken],
      [JWT_COOKIE, sessionJwt]
    ].map(([name, value]) =>
      altSession()
        .cookies.set({
          url: 'https://alt.xyz',
          name,
          value,
          secure: true,
          httpOnly: false,
          sameSite: 'lax',
          expirationDate
        })
        .catch((error) => logSafe(error))
    )
  )
}

async function refreshSession(report: Report): Promise<string> {
  const stored = readStoredAltSession()
  const cookieToken = await cookieValue(SESSION_COOKIE)
  const candidates = [stored, cookieToken].filter((token, index, list): token is string => Boolean(token) && list.indexOf(token) === index)
  if (candidates.length === 0) {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Alt.')
  }
  report({ id: 'refresh', label: 'Refreshing your Alt session' })
  let rejected = false
  for (const sessionToken of candidates) {
    try {
      const next = await stytchAuthenticate(sessionToken)
      await rememberSession(next.sessionToken, next.sessionJwt)
      return next.sessionJwt
    } catch (error) {
      if (!(error instanceof UserFacingError) || error.message !== 'Sign in again to Alt.') throw error
      rejected = true
    }
  }
  if (rejected) clearSessionTokens()
  throw new UserFacingError('Sign in again to Alt.')
}

async function sessionJwt(report: Report, force = false): Promise<string> {
  if (!force && jwtCache && !tokenExpired(jwtCache)) return jwtCache
  if (!force) {
    const cookieJwt = await cookieValue(JWT_COOKIE)
    if (cookieJwt && !tokenExpired(cookieJwt)) {
      jwtCache = cookieJwt
      return cookieJwt
    }
  }
  if (!force && refreshing) return refreshing
  const pending = refreshSession(report).finally(() => {
    if (refreshing === pending) refreshing = null
  })
  refreshing = pending
  return pending
}

function authFailed(status: number, body: { errors?: { message?: unknown; extensions?: { code?: unknown } }[] } | null): boolean {
  if (status === 401 || (status === 403 && body)) return true
  return (
    body?.errors?.some((error) => {
      const code = typeof error.extensions?.code === 'string' ? error.extensions.code : ''
      const message = typeof error.message === 'string' ? error.message : ''
      return /auth/i.test(code) || /unauthenticated|sign in/i.test(message)
    }) ?? false
  )
}

async function altQuery(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  report: Report,
  mutation = false
): Promise<unknown> {
  return requestAlt(operationName, query, variables, report, mutation, false)
}

async function requestAlt(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  report: Report,
  mutation: boolean,
  retried: boolean
): Promise<unknown> {
  const jwt = await sessionJwt(report, retried)
  let response: Response
  try {
    response = await fetch(`${API_URL}/${operationName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': BROWSER_UA,
        Origin: 'https://alt.xyz',
        Referer: 'https://alt.xyz/',
        authorization: `Bearer ${jwt}`,
        ...(mutation ? { 'Idempotency-Key': crypto.randomUUID() } : { 'allow-read-replica': 'true' })
      },
      body: JSON.stringify({ operationName, query, variables }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    logSafe(error)
    throw new UserFacingError('Alt could not be reached.')
  }

  const body = (await response.json().catch(() => null)) as {
    data?: unknown
    errors?: { message?: unknown; extensions?: { code?: unknown } }[]
  } | null
  if (authFailed(response.status, body) && !retried) {
    jwtCache = null
    return requestAlt(operationName, query, variables, report, mutation, true)
  }
  if (authFailed(response.status, body)) {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Alt.')
  }
  if (!response.ok || !body?.data || typeof body.data !== 'object') {
    throw new UserFacingError('Alt could not be read.')
  }
  return body
}

async function watchFlags(ids: readonly string[], report: Report): Promise<Record<string, boolean>> {
  const flags: Record<string, boolean> = {}
  if (ids.length === 0) return flags
  report({ id: 'watch', label: 'Checking which lots you are watching' })
  for (let index = 0; index < ids.length; index += WATCH_BATCH) {
    const input = ids.slice(index, index + WATCH_BATCH).map((sourceId) => ({ sourceId, listingType: 'AUCTION' }))
    try {
      const body = await altQuery('UniversalWatcherCounts', WATCHERS, { input }, report)
      Object.assign(flags, parseWatcherFlags(body))
    } catch (error) {
      if (error instanceof UserFacingError && error.message === 'Sign in again to Alt.') throw error
      logSafe(error)
    }
  }
  return flags
}

async function fetchBoard(report: Report): Promise<Cache> {
  await sessionJwt(report)
  report({ id: 'load', label: 'Loading your Alt auction' })
  const [context, bids] = await Promise.all([
    altQuery('AltAuctionContext', AUCTION_CONTEXT, {}, report),
    altQuery('MyAuction', MY_AUCTION, {}, report)
  ])
  const cycleId = parseLiveAuctionCycleId(context)
  let lots = parseMyAuction(bids)
  const inCycle = cycleId ? lots.filter((lot) => lot.auctionCycleId === cycleId) : lots
  if (cycleId && inCycle.length > 0) {
    const flags = await watchFlags(inCycle.map((lot) => lot.id), report)
    lots = applyWatcherFlags(lots, flags)
  }
  return { lots, cycleId, auctionName: parseAuctionName(context, cycleId) }
}

function boardFrom(stored: Cache, reshuffle: boolean): AltSnapshot {
  if (!stored.cycleId) return { status: 'empty', message: 'No Alt auction is live right now.' }
  const notes = readAltNotes()
  const eligible = watchingCandidates(
    stored.lots.filter((lot) => lot.auctionCycleId === stored.cycleId),
    notes
  )
  const watchingIds = chooseWatchingIds(eligible, readWatchingSample(), reshuffle)
  saveWatchingSample(watchingIds)
  return buildAltBoard(stored.lots, notes, watchingIds, { id: stored.cycleId, name: stored.auctionName })
}

export async function altBoard(refresh: boolean, reshuffleWatching: boolean, report: Report = quiet): Promise<AltSnapshot> {
  if (!hasStoredAltSession()) return { status: 'signed-out' }
  if (refresh || !cache) cache = await fetchBoard(report)
  report({ id: 'prepare', label: 'Preparing your auction' })
  return boardFrom(cache, reshuffleWatching)
}

export async function updateAltItem(input: { id: string; marketPrice: number | null; placement: AltPlacement }): Promise<AltSnapshot> {
  if (!input.id) throw new UserFacingError('That bid could not be updated.')
  saveAltNote(input.id, { marketPrice: input.marketPrice, placement: input.placement })
  if (!hasStoredAltSession()) return { status: 'signed-out' }
  if (!cache) cache = await fetchBoard(quiet)
  return boardFrom(cache, false)
}

export async function toggleAltWatch(id: string, watching: boolean): Promise<AltSnapshot> {
  if (!id) throw new UserFacingError('That lot could not be updated on Alt.')
  if (!hasStoredAltSession()) return { status: 'signed-out' }
  if (!cache) cache = await fetchBoard(quiet)
  const lot = cache.lots.find((item) => item.id === id)
  if (!lot) throw new UserFacingError('That lot could not be updated on Alt.')
  if (lot.watching === watching) return boardFrom(cache, false)

  // Alt's schema spells this mutation "Unviersal".
  const body = await altQuery('ToggleUniversalWatchlist', TOGGLE_WATCH, { input: { listingType: 'AUCTION', sourceId: id } }, quiet, true)
  const result = parseWatchToggle(body)
  if (!result.ok) throw new UserFacingError(result.message)
  cache = {
    ...cache,
    lots: cache.lots.flatMap((item) => {
      if (item.id !== id) return [item]
      if (!result.watching && !item.hasBid) return []
      return [{ ...item, watching: result.watching }]
    })
  }
  return boardFrom(cache, false)
}

export function parseAltUpdate(input: unknown): { id: string; marketPrice: number | null; placement: AltPlacement } {
  if (typeof input !== 'object' || input === null) throw new UserFacingError('That bid could not be updated.')
  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) throw new UserFacingError('That bid could not be updated.')
  const placement: AltPlacement = record.placement === 'pinned' || record.placement === 'hidden' ? record.placement : 'auto'
  if (typeof record.marketPrice === 'number') {
    const parsed = parseMarketPrice(String(record.marketPrice))
    if (!parsed.ok) throw new UserFacingError('Enter a market price greater than zero.')
    return { id, marketPrice: parsed.value, placement }
  }
  if (record.marketPrice != null) throw new UserFacingError('Enter a market price greater than zero.')
  return { id, marketPrice: null, placement }
}

export function parseAltWatch(input: unknown): { id: string; watching: boolean } {
  if (typeof input !== 'object' || input === null) throw new UserFacingError('That lot could not be updated on Alt.')
  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id || typeof record.watching !== 'boolean') throw new UserFacingError('That lot could not be updated on Alt.')
  return { id, watching: record.watching }
}

function chromeCookie(name: string, value: string): ChromeCookie {
  const expires = tokenExpiry(value)
  return expires ? { name, value, expires } : { name, value }
}

export async function openAltListing(url: string): Promise<void> {
  if (!isAltListingUrl(url)) throw new UserFacingError('That Alt listing could not be opened.')
  const jwt = await sessionJwt(quiet)
  const sessionToken = readStoredAltSession()
  if (!sessionToken) throw new UserFacingError('Sign in again to Alt.')
  await openSignedInChrome(url, [chromeCookie(SESSION_COOKIE, sessionToken), chromeCookie(JWT_COOKIE, jwt)], altChromeSite)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const AUTH_PATHS = ['/login', '/authenticate', '/mfa-challenge', '/mfa-setup', '/signup', '/email-confirm']

function authPage(url: string): boolean {
  try {
    const path = new URL(url).pathname
    return AUTH_PATHS.some((item) => path === item || path.startsWith(`${item}/`))
  } catch {
    return true
  }
}

async function clearLoginStorage(): Promise<void> {
  await altSession().clearStorageData()
}

async function runAltSignIn(report: Report): Promise<void> {
  await clearLoginStorage()
  const win = new BrowserWindow({
    width: 960,
    height: 760,
    title: 'Sign in to Alt',
    backgroundColor: '#f3eee6',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  signInWindow = win
  win.webContents.setUserAgent(BROWSER_UA)
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }
  }))

  const signInState: { outcome: 'pending' | 'success' | 'cancel' } = { outcome: 'pending' }
  win.on('closed', () => {
    if (signInState.outcome === 'pending') signInState.outcome = 'cancel'
    if (signInWindow === win) signInWindow = null
  })

  report({ id: 'open', label: 'Opening Alt' })
  try {
    await win.loadURL(LOGIN_URL)
  } catch (error) {
    signInState.outcome = 'cancel'
    if (!win.isDestroyed()) win.close()
    logSafe(error)
    throw new UserFacingError('Alt could not be opened.')
  }

  report({ id: 'wait', label: 'Enter your email, then the code sent to your phone' })
  const deadline = Date.now() + 10 * 60_000
  let signedInPageSince = 0
  while (Date.now() < deadline) {
    if (signInState.outcome === 'cancel') throw new UserFacingError('Alt sign-in was canceled.')
    const sessionToken = (await pageCookie(win, SESSION_COOKIE)) ?? (await cookieValue(SESSION_COOKIE))
    const jwt = (await pageCookie(win, JWT_COOKIE)) ?? (await cookieValue(JWT_COOKIE))
    const stillSigningIn = win.isDestroyed() || authPage(win.webContents.getURL())
    if (sessionToken && sessionToken.length >= 20 && jwt && !tokenExpired(jwt) && !stillSigningIn) {
      if (!signedInPageSince) signedInPageSince = Date.now()
      if (Date.now() - signedInPageSince >= 1_500) {
        signInState.outcome = 'success'
        report({ id: 'save', label: 'Saving your Alt session' })
        await rememberSession(sessionToken, jwt)
        clearBidCache()
        if (!win.isDestroyed()) win.close()
        return
      }
    } else {
      signedInPageSince = 0
    }
    await delay(400)
  }

  signInState.outcome = 'cancel'
  if (!win.isDestroyed()) win.close()
  throw new UserFacingError('Alt sign-in timed out.')
}

export function signInToAlt(report: Report = quiet): Promise<void> {
  if (signInPromise) return Promise.reject(new UserFacingError('Alt sign-in is already in progress.'))
  signInPromise = runAltSignIn(report).finally(() => {
    signInPromise = null
  })
  return signInPromise
}

export async function signOutOfAlt(): Promise<void> {
  if (signInWindow && !signInWindow.isDestroyed()) signInWindow.close()
  clearSessionTokens()
}
