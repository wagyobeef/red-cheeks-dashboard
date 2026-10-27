import { formatUsd } from './present'

export const BUYERS_PREMIUM_RATE = 1.2

export type BidStatus = 'winning' | 'outbid'
export type ExtensionTag = 'next-window' | 'needs-bid'
export type BidPlacement = 'pinned' | 'hidden' | 'auto'
export type BidSectionId = 'pinned' | 'winning' | 'losing' | 'won' | 'hidden'

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
}

export type FanaticsSection = {
  id: BidSectionId
  title: string
  items: FanaticsItem[]
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
      winningCurrentTotal: number
      winningMaxTotal: number
      sections: FanaticsSection[]
    }
  | { status: 'empty'; message: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }

const SECTION_TITLES: { id: BidSectionId; title: string }[] = [
  { id: 'pinned', title: 'Pinned' },
  { id: 'winning', title: 'Winning' },
  { id: 'losing', title: 'Losing' },
  { id: 'won', title: 'Won' },
  { id: 'hidden', title: 'Hidden' }
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

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseNode(node: unknown): ParsedBid | null {
  if (typeof node !== 'object' || node === null) return null
  const record = node as Record<string, unknown>
  const id = text(record.id)
  const name = text(record.title)
  const status = typeof record.states === 'object' && record.states !== null ? bidStatus((record.states as Record<string, unknown>).userBidStatus) : null
  const states = typeof record.states === 'object' && record.states !== null ? (record.states as Record<string, unknown>) : null
  const closed = states?.isClosed === true
  if (!id || !name || !status || !states || (closed && status !== 'winning')) return null

  const currentCents = moneyCents(record.currentBid)
  if (currentCents === null) return null
  const maxCents = moneyCents(states.userMaxBid)
  const auction = typeof record.auction === 'object' && record.auction !== null ? (record.auction as Record<string, unknown>) : null
  const endsAtRaw = auction ? text(auction.endsAt) : ''
  const endsAtMs = endsAtRaw ? Date.parse(endsAtRaw) : Number.NaN
  const timer = auction && typeof auction.collectListingTimer === 'object' && auction.collectListingTimer !== null
    ? (auction.collectListingTimer as Record<string, unknown>)
    : null

  return {
    id,
    name,
    url: fanaticsListingUrl(id, text(record.slug)),
    status,
    currentBid: withBuyersPremium(currentCents),
    maxBid: maxCents === null ? null : withBuyersPremium(maxCents),
    auctionId: auction ? text(auction.id) : '',
    auctionName: auction ? text(auction.name) || null : null,
    endsAt: Number.isFinite(endsAtMs) ? endsAtMs : null,
    auctionStatus: auction ? text(auction.status) || null : null,
    windowOrdinal: wholeNumber(timer?.windowOrdinal),
    lastWindowWhenBidWasReceived: wholeNumber(states.lastWindowWhenBidWasReceived),
    closed
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
    const bid = parseNode((edge as { node?: unknown }).node)
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

function compareItems(a: FanaticsItem, b: FanaticsItem): number {
  const aMax = a.maxBid ?? Number.NEGATIVE_INFINITY
  const bMax = b.maxBid ?? Number.NEGATIVE_INFINITY
  if (aMax !== bMax) return bMax - aMax
  return a.name.localeCompare(b.name)
}

export function buildFanaticsBoard(bids: ParsedBid[], notes: Record<string, BidNote>): FanaticsSnapshot {
  const current = selectCurrentAuction(bids)
  if (current.length === 0) {
    return { status: 'empty', message: 'No active bids in the current weekly auction.' }
  }

  const groups: Record<BidSectionId, FanaticsItem[]> = { pinned: [], winning: [], losing: [], won: [], hidden: [] }
  let winningCount = 0
  let outbidCount = 0
  let winningCurrentTotal = 0
  let winningMaxTotal = 0
  let auctionName: string | null = null

  for (const bid of current) {
    if (!auctionName && bid.auctionName) auctionName = bid.auctionName
    if (bid.status === 'winning') {
      if (!bid.closed) winningCount += 1
      winningCurrentTotal += bid.currentBid
      const max = bid.maxBid ?? (bid.closed ? bid.currentBid : null)
      if (max !== null) winningMaxTotal += max
    } else {
      outbidCount += 1
    }

    const note = notes[bid.id]
    const placement = note?.placement === 'pinned' || note?.placement === 'hidden' ? note.placement : 'auto'
    const item: FanaticsItem = {
      id: bid.id,
      name: bid.name,
      url: bid.url,
      status: bid.status,
      currentBid: bid.currentBid,
      maxBid: bid.maxBid,
      marketPrice: note?.marketPrice ?? null,
      placement,
      extension: bid.closed ? null : extensionTag(bid.auctionStatus, bid.windowOrdinal, bid.lastWindowWhenBidWasReceived),
      closed: bid.closed
    }
    if (placement === 'pinned') groups.pinned.push(item)
    else if (item.closed && item.status === 'winning') groups.won.push(item)
    else if (placement === 'hidden') groups.hidden.push(item)
    else if (item.status === 'winning') groups.winning.push(item)
    else groups.losing.push(item)
  }

  const sections = SECTION_TITLES.flatMap((section) => {
    const items = groups[section.id].sort(compareItems)
    return items.length > 0 ? [{ ...section, items }] : []
  })

  return {
    status: 'ready',
    auctionName,
    winningCount,
    outbidCount,
    winningCurrentTotal,
    winningMaxTotal,
    sections
  }
}
