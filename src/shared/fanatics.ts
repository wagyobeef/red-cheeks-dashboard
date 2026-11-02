import { formatUsd } from './present'

export const BUYERS_PREMIUM_RATE = 1.2
export const FANATICS_WATCHING_SAMPLE_LIMIT = 20

export type BidStatus = 'winning' | 'outbid' | 'watching'
export type ExtensionTag = 'next-window' | 'needs-bid'
export type BidPlacement = 'pinned' | 'hidden' | 'auto'
export type BidSectionId = 'pinned' | 'winning' | 'losing' | 'watching' | 'won' | 'hidden'

export type ParsedBid = {
  id: string
  name: string
  url: string
  status: BidStatus
  currentBid: number
  maxBid: number | null
  auctionId: string
  auctionName: string | null
  endsAt: number | null
  auctionStatus: string | null
  windowOrdinal: number | null
  lastWindowWhenBidWasReceived: number | null
  closed: boolean
  watching: boolean
  hasBid: boolean
  listingType: string
}

export type BidNote = {
  marketPrice: number | null
  placement: BidPlacement
}

export type FanaticsItem = {
  id: string
  name: string
  url: string
  status: BidStatus
  currentBid: number
  maxBid: number | null
  marketPrice: number | null
  placement: BidPlacement
  extension: ExtensionTag | null
  closed: boolean
  watching: boolean
  hasBid: boolean
}

export type FanaticsSection = {
  id: BidSectionId
  title: string
  items: FanaticsItem[]
  refresh: boolean
}

export type LoadStep = { id: string; label: string }

export function pushLoadStep(steps: readonly LoadStep[], step: LoadStep): LoadStep[] {
  const index = steps.findIndex((item) => item.id === step.id)
  if (index === -1) return [...steps, step]
  return [...steps.slice(0, index), step]
}

export function bidPageLabel(page: number, total: number | null, pageSize: number, noun = 'bids'): string {
  const current = page + 1
  if (total === null || total <= 0) return `Loading ${noun}, page ${current}`
  const pages = Math.max(current, Math.ceil(total / pageSize))
  return `Loading ${noun}, page ${current} of ${pages}`
}

const AUCTION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function listingAuctionId(auctionId: string): string | null {
  const raw = auctionId.includes(':') ? auctionId.slice(auctionId.lastIndexOf(':') + 1) : auctionId
  return AUCTION_UUID.test(raw) ? raw : null
}

export type FanaticsSnapshot =
  | {
      status: 'ready'
      auctionName: string | null
      winningCount: number
      outbidCount: number
      watchingCount: number
      winningCurrentTotal: number
      winningMaxTotal: number
      sections: FanaticsSection[]
    }
  | { status: 'empty'; message: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }

const SECTION_TITLES: { id: BidSectionId; title: string; refresh: boolean }[] = [
  { id: 'pinned', title: 'Pinned', refresh: false },
  { id: 'winning', title: 'Winning', refresh: false },
  { id: 'losing', title: 'Losing', refresh: false },
  { id: 'watching', title: 'Watching', refresh: true },
  { id: 'won', title: 'Won', refresh: false },
  { id: 'hidden', title: 'Hidden', refresh: false }
]

export function withBuyersPremium(cents: number): number {
  return Math.round(cents * BUYERS_PREMIUM_RATE) / 100
}

export function fanaticsListingUrl(id: string, slug: string): string {
  const base = `https://www.fanaticscollect.com/weekly/${encodeURIComponent(id)}`
  return slug ? `${base}/${encodeURIComponent(slug)}` : base
}

export function isFanaticsListingUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'www.fanaticscollect.com' && url.pathname.startsWith('/weekly/')
  } catch {
    return false
  }
}

const FANATICS_CARD_PREFIXES = ['/weekly/', '/premier/', '/fixed/', '/buy-now/', '/collection/i/']

export function isFanaticsCardUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'www.fanaticscollect.com') return false
    return FANATICS_CARD_PREFIXES.some((prefix) => url.pathname.startsWith(prefix) && url.pathname.length > prefix.length)
  } catch {
    return false
  }
}

export function fanaticsCardUrl(section: 'weekly' | 'premier' | 'fixed' | 'buy-now' | 'collection', id: string, slug = ''): string {
  const root = section === 'collection' ? 'collection/i' : section
  const base = `https://www.fanaticscollect.com/${root}/${encodeURIComponent(id)}`
  return section !== 'collection' && slug ? `${base}/${encodeURIComponent(slug)}` : base
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const base64 = padded.length % 4 === 0 ? padded : padded + '='.repeat(4 - (padded.length % 4))
  return atob(base64)
}

export function tokenExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown }
    return typeof json.exp === 'number' && Number.isFinite(json.exp) ? json.exp : null
  } catch {
    return null
  }
}

export function tokenExpired(token: string, now = Date.now()): boolean {
  const exp = tokenExpiry(token)
  if (exp === null) return false
  return exp * 1000 <= now + 60_000
}

export function parseMarketPrice(raw: string): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim().replace(/[$,]/g, '')
  if (!trimmed) return { ok: true, value: null }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0) return { ok: false }
  return { ok: true, value: Math.round(value * 100) / 100 }
}

export function extensionTag(
  auctionStatus: string | null,
  windowOrdinal: number | null,
  lastWindowWhenBidWasReceived: number | null
): ExtensionTag | null {
  if (auctionStatus !== 'EXTENDED_BIDDING' || windowOrdinal === null || windowOrdinal <= 0) return null
  return lastWindowWhenBidWasReceived === windowOrdinal ? 'next-window' : 'needs-bid'
}

function bidReference(currentBid: number, maxBid: number | null): number {
  return maxBid === null ? currentBid : Math.max(currentBid, maxBid)
}

export function formatMarketComparison(currentBid: number, maxBid: number | null, marketPrice: number): string {
  const reference = bidReference(currentBid, maxBid)
  const profit = marketPrice - reference
  const percent = (reference / marketPrice) * 100
  const percentText = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(percent)
  const signed = profit > 0 ? `+${formatUsd(profit)}` : formatUsd(profit)
  return `${signed} · ${percentText}% of market`
}

function moneyCents(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('amountInCents' in value)) return null
  const cents = value.amountInCents
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return null
  return Math.round(cents)
}

function bidStatus(value: unknown): BidStatus | null {
  if (value === 'HIGH_BID' || value === 'WINNING') return 'winning'
  if (value === 'OUTBID') return 'outbid'
  return null
}

function listingTypeOf(value: unknown): string {
  const type = text(value)
  return type || 'WEEKLY'
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseNode(node: unknown, allowWatching: boolean): ParsedBid | null {
  if (typeof node !== 'object' || node === null) return null
  const record = node as Record<string, unknown>
  const id = text(record.id)
  const name = text(record.title)
  const states = typeof record.states === 'object' && record.states !== null ? (record.states as Record<string, unknown>) : null
  const status = states ? bidStatus(states.userBidStatus) : null
  const watching = states?.isWatching === true || (allowWatching && !status)
  const closed = states?.isClosed === true
  const resolved = status ?? (watching ? 'watching' : null)
  if (!id || !name || !resolved || !states || (closed && resolved !== 'winning')) return null
  if (resolved === 'watching' && !allowWatching) return null

  const currentCents = moneyCents(record.currentBid)
  if (currentCents === null) return null
  const maxCents = moneyCents(states.userMaxBid)
  const auction = typeof record.auction === 'object' && record.auction !== null ? (record.auction as Record<string, unknown>) : null
  const endsAtRaw = auction ? text(auction.endsAt) : ''
  const endsAtMs = endsAtRaw ? Date.parse(endsAtRaw) : Number.NaN
  const timer = auction && typeof auction.collectListingTimer === 'object' && auction.collectListingTimer !== null
    ? (auction.collectListingTimer as Record<string, unknown>)
    : null
  const hasBid = resolved === 'winning' || resolved === 'outbid'

  return {
    id,
    name,
    url: fanaticsListingUrl(id, text(record.slug)),
    status: resolved,
    currentBid: withBuyersPremium(currentCents),
    maxBid: hasBid && maxCents !== null ? withBuyersPremium(maxCents) : null,
    auctionId: auction ? text(auction.id) : '',
    auctionName: auction ? text(auction.name) || null : null,
    endsAt: Number.isFinite(endsAtMs) ? endsAtMs : null,
    auctionStatus: auction ? text(auction.status) || null : null,
    windowOrdinal: wholeNumber(timer?.windowOrdinal),
    lastWindowWhenBidWasReceived: wholeNumber(states.lastWindowWhenBidWasReceived),
    closed,
    watching,
    hasBid,
    listingType: listingTypeOf(record.listingType)
  }
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

export function parseFanaticsListings(payload: unknown): ParsedBid[] {
  if (typeof payload !== 'object' || payload === null) return []
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return []
  const user = (data as { collectCurrentUserV2?: unknown }).collectCurrentUserV2
  if (typeof user !== 'object' || user === null) return []
  const listings = (user as { collectListings?: unknown }).collectListings
  if (typeof listings !== 'object' || listings === null) return []
  const edges = (listings as { edges?: unknown }).edges
  if (!Array.isArray(edges)) return []

  const seen = new Set<string>()
  const bids: ParsedBid[] = []
  for (const edge of edges) {
    if (typeof edge !== 'object' || edge === null) continue
    const bid = parseNode((edge as { node?: unknown }).node, false)
    if (!bid || seen.has(bid.id)) continue
    seen.add(bid.id)
    bids.push(bid)
  }
  return bids
}

export function listingsPage(payload: unknown): { bids: ParsedBid[]; total: number | null } {
  const bids = parseFanaticsListings(payload)
  if (typeof payload !== 'object' || payload === null) return { bids, total: null }
  const data = (payload as { data?: { collectCurrentUserV2?: { collectListings?: { total?: unknown } } } }).data
  const total = data?.collectCurrentUserV2?.collectListings?.total
  return { bids, total: typeof total === 'number' && Number.isFinite(total) ? total : null }
}

export function parseFanaticsWatchlist(payload: unknown): ParsedBid[] {
  if (typeof payload !== 'object' || payload === null) return []
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return []
  const user = (data as { collectCurrentUserV2?: unknown }).collectCurrentUserV2
  if (typeof user !== 'object' || user === null) return []
  const listings = (user as { collectWatchlist?: unknown }).collectWatchlist
  if (typeof listings !== 'object' || listings === null) return []
  const edges = (listings as { edges?: unknown }).edges
  if (!Array.isArray(edges)) return []

  const seen = new Set<string>()
  const lots: ParsedBid[] = []
  for (const edge of edges) {
    if (typeof edge !== 'object' || edge === null) continue
    const lot = parseNode((edge as { node?: unknown }).node, true)
    if (!lot || lot.listingType !== 'WEEKLY' || seen.has(lot.id)) continue
    seen.add(lot.id)
    lots.push({ ...lot, watching: true })
  }
  return lots
}

export function watchlistPage(payload: unknown): { lots: ParsedBid[]; total: number | null } {
  const lots = parseFanaticsWatchlist(payload)
  if (typeof payload !== 'object' || payload === null) return { lots, total: null }
  const data = (payload as { data?: { collectCurrentUserV2?: { collectWatchlist?: { total?: unknown } } } }).data
  const total = data?.collectCurrentUserV2?.collectWatchlist?.total
  return { lots, total: typeof total === 'number' && Number.isFinite(total) ? total : null }
}

export function parseWatchToggle(payload: unknown): { ok: true; watching: boolean } | { ok: false; message: string } {
  if (typeof payload !== 'object' || payload === null) return { ok: false, message: 'That lot could not be updated on Fanatics.' }
  const data = (payload as { data?: Record<string, unknown> }).data
  const toggle =
    data && typeof data === 'object'
      ? (data.collectWatchListing as Record<string, unknown> | undefined) ??
        (data.collectUnwatchListing as Record<string, unknown> | undefined)
      : undefined
  if (!toggle || typeof toggle !== 'object') return { ok: false, message: 'That lot could not be updated on Fanatics.' }
  if (toggle.successful === true) {
    const result = typeof toggle.result === 'object' && toggle.result !== null ? (toggle.result as Record<string, unknown>) : null
    const listing = result && typeof result.listing === 'object' && result.listing !== null ? (result.listing as Record<string, unknown>) : null
    const states = listing && typeof listing.states === 'object' && listing.states !== null ? (listing.states as Record<string, unknown>) : null
    if (typeof states?.isWatching === 'boolean') return { ok: true, watching: states.isWatching }
    if (data?.collectWatchListing) return { ok: true, watching: true }
    if (data?.collectUnwatchListing) return { ok: true, watching: false }
  }
  const messages = Array.isArray(toggle.messages) ? toggle.messages : []
  for (const message of messages) {
    if (typeof message === 'object' && message !== null && typeof (message as { message?: unknown }).message === 'string') {
      const textMessage = (message as { message: string }).message.trim()
      if (textMessage) return { ok: false, message: textMessage }
    }
  }
  return { ok: false, message: 'That lot could not be updated on Fanatics.' }
}

export function fanaticsWatchingCandidates(lots: readonly ParsedBid[], notes: Record<string, BidNote>): string[] {
  return lots
    .filter((lot) => lot.watching && !lot.hasBid && !lot.closed && placementOf(notes[lot.id]) === 'auto')
    .map((lot) => lot.id)
}

export function chooseFanaticsWatchingIds(
  eligible: readonly string[],
  previous: readonly string[],
  refresh: boolean,
  random: () => number = Math.random
): string[] {
  const allowed = new Set(eligible)
  if (!refresh) {
    const kept = previous.filter((id, index) => allowed.has(id) && previous.indexOf(id) === index).slice(0, FANATICS_WATCHING_SAMPLE_LIMIT)
    if (kept.length > 0) return kept
  }
  const pool = [...new Set(eligible)]
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = pool[index]
    const swap = pool[swapIndex]
    if (current === undefined || swap === undefined) continue
    pool[index] = swap
    pool[swapIndex] = current
  }
  return pool.slice(0, FANATICS_WATCHING_SAMPLE_LIMIT)
}

function placementOf(note: BidNote | undefined): BidPlacement {
  return note?.placement === 'pinned' || note?.placement === 'hidden' ? note.placement : 'auto'
}

export type WeeklyAuctionSchedule = {
  id: string
  kind: string | null
  status: string | null
  endsAt: number | null
}

function pacificDay(ms: number): string | null {
  if (!Number.isFinite(ms)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(ms)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : null
}

export function selectWeeklyAuctionEndingToday(auctions: readonly WeeklyAuctionSchedule[], now = Date.now()): string | null {
  const today = pacificDay(now)
  if (!today) return null
  const endingToday = auctions.filter((auction) => {
    if (auction.kind !== 'CollectWeeklyAuction' || auction.endsAt === null) return false
    return pacificDay(auction.endsAt) === today
  })
  const extended = endingToday.filter((auction) => auction.status === 'EXTENDED_BIDDING')
  const pool = extended.length > 0 ? extended : endingToday.filter((auction) => auction.status === 'CLOSED')
  const chosen = pool.reduce<WeeklyAuctionSchedule | null>((best, auction) => {
    if (!best || (auction.endsAt ?? Number.POSITIVE_INFINITY) < (best.endsAt ?? Number.POSITIVE_INFINITY)) return auction
    return best
  }, null)
  return chosen ? listingAuctionId(chosen.id) : null
}

export function selectCurrentAuction(bids: ParsedBid[]): ParsedBid[] {
  if (bids.length === 0) return []
  let best = Number.POSITIVE_INFINITY
  let bestId: string | null = null
  for (const bid of bids) {
    const rank = bid.endsAt ?? Number.POSITIVE_INFINITY
    if (rank < best) {
      best = rank
      bestId = bid.auctionId
    }
  }
  if (best === Number.POSITIVE_INFINITY) return bids
  return bids.filter((bid) => bid.auctionId === bestId)
}

function rank(item: FanaticsItem): number {
  return item.maxBid ?? item.currentBid
}

function compareItems(a: FanaticsItem, b: FanaticsItem): number {
  const difference = rank(b) - rank(a)
  if (difference !== 0) return difference
  return a.name.localeCompare(b.name)
}

export function buildFanaticsBoard(
  bids: ParsedBid[],
  notes: Record<string, BidNote>,
  watchingIds: readonly string[] = []
): FanaticsSnapshot {
  const current = selectCurrentAuction(bids)
  if (current.length === 0) {
    return { status: 'empty', message: 'No bids or watched lots in the current weekly auction.' }
  }

  const groups: Record<BidSectionId, FanaticsItem[]> = {
    pinned: [],
    winning: [],
    losing: [],
    watching: [],
    won: [],
    hidden: []
  }
  const byId = new Map<string, FanaticsItem>()
  let winningCount = 0
  let outbidCount = 0
  let watchingCount = 0
  let winningCurrentTotal = 0
  let winningMaxTotal = 0
  let auctionName: string | null = null

  for (const bid of current) {
    if (!auctionName && bid.auctionName) auctionName = bid.auctionName
    if (bid.watching && !bid.closed) watchingCount += 1
    if (bid.status === 'winning') {
      if (!bid.closed) winningCount += 1
      winningCurrentTotal += bid.currentBid
      const max = bid.maxBid ?? (bid.closed ? bid.currentBid : null)
      if (max !== null) winningMaxTotal += max
    } else if (bid.status === 'outbid') {
      outbidCount += 1
    }

    const note = notes[bid.id]
    const item: FanaticsItem = {
      id: bid.id,
      name: bid.name,
      url: bid.url,
      status: bid.status,
      currentBid: bid.currentBid,
      maxBid: bid.maxBid,
      marketPrice: note?.marketPrice ?? null,
      placement: placementOf(note),
      extension: bid.closed ? null : extensionTag(bid.auctionStatus, bid.windowOrdinal, bid.lastWindowWhenBidWasReceived),
      closed: bid.closed,
      watching: bid.watching,
      hasBid: bid.hasBid
    }
    byId.set(item.id, item)
    if (item.placement === 'pinned') groups.pinned.push(item)
    else if (item.closed && item.status === 'winning') groups.won.push(item)
    else if (item.placement === 'hidden') groups.hidden.push(item)
    else if (item.status === 'winning') groups.winning.push(item)
    else if (item.status === 'outbid') groups.losing.push(item)
  }

  const sampled = new Set<string>()
  for (const id of watchingIds) {
    const item = byId.get(id)
    if (!item || item.placement !== 'auto' || !item.watching || item.hasBid || sampled.has(id)) continue
    sampled.add(id)
    groups.watching.push(item)
  }

  const unsampledWatching = fanaticsWatchingCandidates(current, notes).length > 0
  const sections = SECTION_TITLES.flatMap((section) => {
    const items = groups[section.id].sort(compareItems)
    if (items.length === 0 && !(section.id === 'watching' && unsampledWatching)) return []
    return [{ ...section, items }]
  })

  return {
    status: 'ready',
    auctionName,
    winningCount,
    outbidCount,
    watchingCount,
    winningCurrentTotal,
    winningMaxTotal,
    sections
  }
}
