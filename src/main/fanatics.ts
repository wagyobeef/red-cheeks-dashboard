import { BrowserWindow, session } from 'electron'
import {
  bidPageLabel,
  buildFanaticsBoard,
  isFanaticsListingUrl,
  listingAuctionId,
  listingsPage,
  selectCurrentAuction,
  selectWeeklyAuctionEndingToday,
  type WeeklyAuctionSchedule,
  parseMarketPrice,
  tokenExpired,
  tokenExpiry,
  type BidNote,
  type BidPlacement,
  type FanaticsSnapshot,
  type LoadStep,
  type ParsedBid
} from '../shared/fanatics'
import { closeSignedInChrome, openSignedInChrome, type ChromeCookie } from './fanaticsChrome'
import { UserFacingError, logSafe } from './errors'
import {
  clearStoredRefreshToken,
  readFanaticsNotes,
  readStoredRefreshToken,
  saveFanaticsNote,
  saveStoredRefreshToken
} from './fanaticsStore'

const PARTITION = 'persist:fanatics-collect'
const API_URL = 'https://app.fanaticscollect.com/graphql'
const LOGIN_URL = 'https://www.fanaticscollect.com/activity/bids/active/auction'
const ACCESS_COOKIE = 'pwcc-access-token'
const REFRESH_COOKIE = 'pwcc-refresh-token'
const PAGE_SIZE = 100
const MAX_PAGES = 30

const BIDS_QUERY = `
  query webGetActiveAuctionsBidsQuery(
    $bidType: CollectBidType
    $listingStatus: [CollectListingStatusFilter]
    $listingTypes: [CollectListingType]
    $listingAuctionId: UUID
    $first: Int
    $offset: Int
  ) {
    collectCurrentUserV2 {
      tenantId
      collectListings(
        includeBids: true
        bidType: $bidType
        listingStatuses: $listingStatus
        listingTypes: $listingTypes
        listingAuctionId: $listingAuctionId
        first: $first
        offset: $offset
      ) {
        edges {
          node {
            id
            slug
            title
            auction {
              id
              name
              endsAt
              status
              collectListingTimer { windowOrdinal }
            }
            states {
              userMaxBid { amountInCents currency }
              userBidStatus
              isClosed
              lastWindowWhenBidWasReceived
            }
            currentBid { amountInCents currency }
          }
        }
        total
      }
    }
  }
`

const REFRESH_MUTATION = `
  mutation webRefreshTokenMutation($refreshToken: String!) {
    collectRefreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`

type Report = (step: LoadStep) => void

const quiet: Report = () => {}

let bidCache: ParsedBid[] | null = null
let signInPromise: Promise<void> | null = null
let signInWindow: BrowserWindow | null = null

function fanaticsSession() {
  return session.fromPartition(PARTITION)
}

function clearBidCache(): void {
  bidCache = null
}

async function cookieValue(name: string): Promise<string | null> {
  const cookies = await Promise.race([
    fanaticsSession().cookies.get({ url: 'https://www.fanaticscollect.com', name }),
    delay(800).then(() => null)
  ])
  if (!cookies) return null
  const match = cookies.find((cookie) => cookie.value)
  return match?.value ?? null
}

async function pageCookie(win: BrowserWindow, name: string): Promise<string | null> {
  if (win.isDestroyed()) return null
  const url = win.webContents.getURL()
  if (!url.startsWith('https://www.fanaticscollect.com') && !url.startsWith('https://fanaticscollect.com')) return null
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

async function writeCookie(name: string, token: string): Promise<void> {
  const exp = tokenExpiry(token)
  await fanaticsSession().cookies.set({
    url: 'https://www.fanaticscollect.com',
    name,
    value: token,
    domain: '.fanaticscollect.com',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax',
    ...(exp ? { expirationDate: exp } : {})
  })
}

function clearSessionTokens(): void {
  clearStoredRefreshToken()
  clearBidCache()
  void fanaticsSession()
    .clearStorageData()
    .catch((error) => logSafe(error))
  void closeSignedInChrome()
}

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-platform': 'web', 'x-platform-app': 'collect' },
      body: JSON.stringify({ operationName: 'webRefreshTokenMutation', query: REFRESH_MUTATION, variables: { refreshToken } }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    logSafe(error)
    throw new UserFacingError('Fanatics Collect could not be reached.')
  }

  const body = (await response.json().catch(() => null)) as {
    data?: { collectRefreshToken?: { accessToken?: unknown; refreshToken?: unknown } }
  } | null
  const next = body?.data?.collectRefreshToken
  if (response.status === 401 || response.status === 403) {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Fanatics Collect.')
  }
  if (!response.ok) throw new UserFacingError('Fanatics Collect could not be read.')
  if (typeof next?.accessToken !== 'string' || typeof next.refreshToken !== 'string') {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Fanatics Collect.')
  }
  return { accessToken: next.accessToken, refreshToken: next.refreshToken }
}

let refreshing: Promise<string> | null = null

async function accessToken(report: Report): Promise<string> {
  if (refreshing) return refreshing
  refreshing = refreshAccessToken(report).finally(() => {
    refreshing = null
  })
  return refreshing
}

async function refreshAccessToken(report: Report): Promise<string> {
  const refresh = readStoredRefreshToken()
  if (!refresh || tokenExpired(refresh)) {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Fanatics Collect.')
  }
  report({ id: 'refresh', label: 'Refreshing your Fanatics session' })
  const next = await refreshTokens(refresh)
  saveStoredRefreshToken(next.refreshToken)
  void writeCookie(ACCESS_COOKIE, next.accessToken).catch((error) => logSafe(error))
  void writeCookie(REFRESH_COOKIE, next.refreshToken).catch((error) => logSafe(error))
  return next.accessToken
}

export function hasStoredFanaticsSession(): boolean {
  const refresh = readStoredRefreshToken()
  if (!refresh) return false
  if (!tokenExpired(refresh)) return true
  clearStoredRefreshToken()
  return false
}

async function graphql(
  token: string,
  offset: number,
  listingStatus: string[],
  auctionId?: string,
  bidType?: string
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API_URL}?webGetActiveAuctionsBidsQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-platform': 'web',
        'x-platform-app': 'collect'
      },
      body: JSON.stringify({
        operationName: 'webGetActiveAuctionsBidsQuery',
        query: BIDS_QUERY,
        variables: {
          listingStatus,
          listingTypes: ['WEEKLY'],
          first: PAGE_SIZE,
          offset,
          ...(auctionId ? { listingAuctionId: auctionId } : {}),
          ...(bidType ? { bidType } : {})
        }
      }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    logSafe(error)
    throw new UserFacingError('Fanatics Collect could not be reached.')
  }

  if (response.status === 401 || response.status === 403) {
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Fanatics Collect.')
  }
  if (!response.ok) throw new UserFacingError('Fanatics Collect could not be read.')

  const body = (await response.json().catch(() => null)) as { data?: { collectCurrentUserV2?: unknown }; errors?: unknown[] } | null
  if (!body?.data?.collectCurrentUserV2) {
    if (body?.errors?.length) throw new UserFacingError('Fanatics Collect could not be read.')
    clearSessionTokens()
    throw new UserFacingError('Sign in again to Fanatics Collect.')
  }
  return body
}

function pageEdgeCount(payload: unknown): number {
  if (typeof payload !== 'object' || payload === null) return 0
  const edges = (payload as { data?: { collectCurrentUserV2?: { collectListings?: { edges?: unknown } } } }).data
    ?.collectCurrentUserV2?.collectListings?.edges
  return Array.isArray(edges) ? edges.length : 0
}

async function fetchBidPages(
  token: string,
  report: Report,
  noun: string,
  listingStatus: string[],
  auctionId?: string,
  bidType?: string
): Promise<ParsedBid[]> {
  const bids: ParsedBid[] = []
  const seen = new Set<string>()
  let total: number | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    report({ id: 'bids', label: bidPageLabel(page, total, PAGE_SIZE, noun) })
    const body = await graphql(token, page * PAGE_SIZE, listingStatus, auctionId, bidType)
    const pageResult = listingsPage(body)
    const received = pageEdgeCount(body)
    if (pageResult.total !== null) total = pageResult.total
    report({ id: 'bids', label: bidPageLabel(page, total, PAGE_SIZE, noun) })
    if (received === 0) break
    for (const bid of pageResult.bids) {
      if (seen.has(bid.id)) continue
      seen.add(bid.id)
      bids.push(bid)
    }
    if (received < PAGE_SIZE || (total !== null && bids.length >= total)) break
  }
  return bids
}

const AUCTIONS_QUERY = `
  query webGlobalAuctionsQuery {
    collectGlobalAuctions {
      __typename
      id
      status
      endsAt
    }
  }
`

async function todaysWeeklyAuctionId(): Promise<string | null> {
  let response: Response
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-platform': 'web', 'x-platform-app': 'collect' },
      body: JSON.stringify({ query: AUCTIONS_QUERY }),
      signal: AbortSignal.timeout(20_000)
    })
  } catch (error) {
    logSafe(error)
    return null
  }
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as { data?: { collectGlobalAuctions?: unknown } } | null
  const rows = body?.data?.collectGlobalAuctions
  if (!Array.isArray(rows)) return null
  const auctions: WeeklyAuctionSchedule[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const id = typeof record.id === 'string' ? record.id : ''
    const endsAt = typeof record.endsAt === 'string' ? Date.parse(record.endsAt) : Number.NaN
    auctions.push({
      id,
      kind: typeof record.__typename === 'string' ? record.__typename : null,
      status: typeof record.status === 'string' ? record.status : null,
      endsAt: Number.isFinite(endsAt) ? endsAt : null
    })
  }
  return selectWeeklyAuctionEndingToday(auctions)
}

async function fetchBids(report: Report): Promise<ParsedBid[]> {
  const token = await accessToken(report)
  const open = await fetchBidPages(token, report, 'bids', ['OPEN'])
  let auctionId = listingAuctionId(selectCurrentAuction(open).find((bid) => bid.auctionId)?.auctionId ?? '')
  if (!auctionId && open.length === 0) auctionId = await todaysWeeklyAuctionId()
  if (!auctionId) return open
  let won: ParsedBid[] = []
  try {
    // SOLD is the site's won filter and skips the auction in progress. Closed winning lots are that auction's recent wins.
    won = await fetchBidPages(token, report, 'won lots', ['CLOSED'], auctionId, 'WINNING')
  } catch (error) {
    logSafe(error)
  }
  const seen = new Set(open.map((bid) => bid.id))
  return [...open, ...won.filter((bid) => !seen.has(bid.id))]
}

function boardFrom(bids: ParsedBid[]): FanaticsSnapshot {
  return buildFanaticsBoard(bids, readFanaticsNotes())
}

export async function fanaticsBoard(refresh: boolean, report: Report = quiet): Promise<FanaticsSnapshot> {
  if (!hasStoredFanaticsSession()) return { status: 'signed-out' }
  if (refresh || !bidCache) bidCache = await fetchBids(report)
  report({ id: 'prepare', label: 'Preparing your auction' })
  return boardFrom(bidCache)
}

function noteFrom(input: { marketPrice: number | null; placement: BidPlacement }): BidNote {
  return { marketPrice: input.marketPrice, placement: input.placement }
}

export async function updateFanaticsItem(input: {
  id: string
  marketPrice: number | null
  placement: BidPlacement
}): Promise<FanaticsSnapshot> {
  if (!input.id) throw new UserFacingError('That bid could not be updated.')
  saveFanaticsNote(input.id, noteFrom(input))
  if (!hasStoredFanaticsSession()) return { status: 'signed-out' }
  if (!bidCache) bidCache = await fetchBids(quiet)
  return boardFrom(bidCache)
}

export function parseFanaticsUpdate(input: unknown): { id: string; marketPrice: number | null; placement: BidPlacement } {
  if (typeof input !== 'object' || input === null) throw new UserFacingError('That bid could not be updated.')
  const record = input as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id.trim() : ''
  if (!id) throw new UserFacingError('That bid could not be updated.')
  const placement: BidPlacement = record.placement === 'pinned' || record.placement === 'hidden' ? record.placement : 'auto'
  if (typeof record.marketPrice === 'number') {
    const parsed = parseMarketPrice(String(record.marketPrice))
    if (!parsed.ok) throw new UserFacingError('Enter a market price greater than zero.')
    return { id, marketPrice: parsed.value, placement }
  }
  if (record.marketPrice != null) throw new UserFacingError('Enter a market price greater than zero.')
  return { id, marketPrice: null, placement }
}

function chromeCookie(name: string, value: string): ChromeCookie {
  const expires = tokenExpiry(value)
  return expires ? { name, value, expires } : { name, value }
}

export async function openFanaticsListing(url: string): Promise<void> {
  if (!isFanaticsListingUrl(url)) throw new UserFacingError('That Fanatics listing could not be opened.')
  const access = await accessToken(quiet)
  const refresh = readStoredRefreshToken()
  if (!refresh) throw new UserFacingError('Sign in again to Fanatics Collect.')
  await openSignedInChrome(url, [chromeCookie(ACCESS_COOKIE, access), chromeCookie(REFRESH_COOKIE, refresh)])
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runFanaticsSignIn(report: Report): Promise<void> {
  const win = new BrowserWindow({
    width: 960,
    height: 760,
    title: 'Sign in to Fanatics Collect',
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
  win.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  )
  win.webContents.setWindowOpenHandler(() => ({ action: 'allow' }))

  const signInState: { outcome: 'pending' | 'success' | 'cancel' } = { outcome: 'pending' }
  win.on('closed', () => {
    if (signInState.outcome === 'pending') signInState.outcome = 'cancel'
    if (signInWindow === win) signInWindow = null
  })

  report({ id: 'open', label: 'Opening Fanatics Collect' })
  try {
    await win.loadURL(LOGIN_URL)
  } catch (error) {
    signInState.outcome = 'cancel'
    if (!win.isDestroyed()) win.close()
    logSafe(error)
    throw new UserFacingError('Fanatics Collect could not be opened.')
  }

  report({ id: 'wait', label: 'Waiting for you to sign in' })
  const deadline = Date.now() + 5 * 60_000
  while (Date.now() < deadline) {
    if (signInState.outcome === 'cancel') throw new UserFacingError('Fanatics sign-in was canceled.')
    const refresh = (await pageCookie(win, REFRESH_COOKIE)) ?? (await cookieValue(REFRESH_COOKIE))
    if (refresh && !tokenExpired(refresh)) {
      signInState.outcome = 'success'
      report({ id: 'save', label: 'Saving your Fanatics session' })
      saveStoredRefreshToken(refresh)
      clearBidCache()
      if (!win.isDestroyed()) win.close()
      return
    }
    await delay(400)
  }

  signInState.outcome = 'cancel'
  if (!win.isDestroyed()) win.close()
  throw new UserFacingError('Fanatics sign-in timed out.')
}

export function signInToFanatics(report: Report = quiet): Promise<void> {
  if (signInPromise) return Promise.reject(new UserFacingError('Fanatics sign-in is already in progress.'))
  signInPromise = runFanaticsSignIn(report).finally(() => {
    signInPromise = null
  })
  return signInPromise
}

export async function signOutOfFanatics(): Promise<void> {
  if (signInWindow && !signInWindow.isDestroyed()) signInWindow.close()
  clearSessionTokens()
}
