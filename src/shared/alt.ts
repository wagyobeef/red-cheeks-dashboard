import { formatUsd } from './present'

export const ALT_PREMIUM_RATE = 1.2
export const WATCHING_SAMPLE_LIMIT = 30

export type AltBidStatus = 'winning' | 'outbid' | 'watching'
export type AltPlacement = 'pinned' | 'hidden' | 'auto'
export type AltSectionId = 'pinned' | 'winning' | 'losing' | 'watching' | 'hidden'

export type AltNote = {
  marketPrice: number | null
  placement: AltPlacement
}

export type ParsedAltLot = {
  id: string
  name: string
  url: string
  status: AltBidStatus
  hasBid: boolean
  watching: boolean
  currentBid: number | null
  maxBid: number | null
  auctionCycleId: string
}

export type AltItem = {
  id: string
  name: string
  url: string
  status: AltBidStatus
  hasBid: boolean
  watching: boolean
  currentBid: number | null
  maxBid: number | null
  marketPrice: number | null
  placement: AltPlacement
}

export type AltSection = {
  id: AltSectionId
  title: string
  items: AltItem[]
  refresh: boolean
}

export type AltSnapshot =
  | {
      status: 'ready'
      auctionName: string | null
      winningCount: number
      outbidCount: number
      winningCurrentTotal: number
      winningMaxTotal: number
      sections: AltSection[]
    }
  | { status: 'empty'; message: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }

const SECTION_TITLES: { id: AltSectionId; title: string; refresh: boolean }[] = [
  { id: 'pinned', title: 'Pinned', refresh: false },
  { id: 'winning', title: 'Winning', refresh: false },
  { id: 'losing', title: 'Losing', refresh: false },
  { id: 'watching', title: 'Watching', refresh: true },
  { id: 'hidden', title: 'Hidden', refresh: false }
]

export function withAltPremium(amount: number): number {
  return Math.round(amount * ALT_PREMIUM_RATE * 100) / 100
}

export function altListingUrl(id: string): string {
  return `https://www.alt.xyz/liquid-auctions/select-listing?ids=${encodeURIComponent(id)}`
}

export function isAltListingUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'www.alt.xyz' || url.hostname === 'alt.xyz') &&
      url.pathname === '/liquid-auctions/select-listing' &&
      url.searchParams.get('ids') !== null &&
      url.searchParams.get('ids') !== ''
    )
  } catch {
    return false
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function dollars(value: unknown): number | null {
  const raw = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
  if (!Number.isFinite(raw) || raw <= 0) return null
  return raw
}

function bidStatus(value: unknown): AltBidStatus | null {
  if (value === 'WINNING') return 'winning'
  if (value === 'OUTBID') return 'outbid'
  if (value === 'WATCHING') return 'watching'
  return null
}

function premium(value: unknown): number | null {
  const amount = dollars(value)
  return amount === null ? null : withAltPremium(amount)
}

export function parseMyAuction(payload: unknown): ParsedAltLot[] {
  const rows = auctionRows(payload)
  const seen = new Set<string>()
  const lots: ParsedAltLot[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const record = row as Record<string, unknown>
    const listingId = id(record.listingId)
    const status = bidStatus(record.status)
    const details = typeof record.itemDetails === 'object' && record.itemDetails !== null ? (record.itemDetails as Record<string, unknown>) : null
    const name = details ? text(details.itemName) : ''
    if (!listingId || !name || !status || seen.has(listingId)) continue
    seen.add(listingId)
    const hasBid = status === 'winning' || status === 'outbid'
    lots.push({
      id: listingId,
      name,
      url: altListingUrl(listingId),
      status,
      hasBid,
      watching: status === 'watching',
      currentBid: premium(record.currentBid),
      maxBid: hasBid ? premium(record.userMaxBid) : null,
      auctionCycleId: id(record.auctionCycleId)
    })
  }
  return lots
}

function auctionRows(payload: unknown): unknown[] {
  if (typeof payload !== 'object' || payload === null) return []
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return []
  const rows = (data as { myAuction?: unknown }).myAuction
  return Array.isArray(rows) ? rows : []
}

const ACTIVE_CYCLE_STATES = new Set(['LIVE', 'ENDING_TODAY', 'ENDING_TOMORROW', 'IN_EXTENDED_BIDDING'])
const CYCLE_PRIORITY: Record<string, number> = {
  IN_EXTENDED_BIDDING: 0,
  ENDING_TODAY: 1,
  ENDING_TOMORROW: 2,
  LIVE: 3
}

function cyclePriority(state: string): number {
  if (!state) return CYCLE_PRIORITY.LIVE
  return CYCLE_PRIORITY[state] ?? 99
}

export function parseActiveAuctionCycles(payload: unknown): { ids: string[]; name: string | null } {
  if (typeof payload !== 'object' || payload === null) return { ids: [], name: null }
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return { ids: [], name: null }
  const rows = (data as { auctionCycles?: unknown }).auctionCycles
  if (!Array.isArray(rows)) return { ids: [], name: null }

  const cycles: { id: string; name: string | null; state: string; expiresAt: number }[] = []
  for (const row of rows) {
    const record = recordOf(row)
    if (!record) continue
    const cycleId = id(record.id)
    if (!cycleId) continue
    const state = text(record.state)
    if (state && !ACTIVE_CYCLE_STATES.has(state)) continue
    const expiresAt = Date.parse(text(record.expiresAt))
    cycles.push({
      id: cycleId,
      name: text(record.name) || null,
      state,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : Number.POSITIVE_INFINITY
    })
  }
  cycles.sort(
    (a, b) => cyclePriority(a.state) - cyclePriority(b.state) || a.expiresAt - b.expiresAt || a.id.localeCompare(b.id)
  )
  const current = cycles[0]
  return current ? { ids: [current.id], name: current.name } : { ids: [], name: null }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function parseWatcherFlags(payload: unknown): Record<string, boolean> {
  const flags: Record<string, boolean> = {}
  if (typeof payload !== 'object' || payload === null) return flags
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return flags
  const rows = (data as { universalWatcherCounts?: unknown }).universalWatcherCounts
  if (!Array.isArray(rows)) return flags
  for (const row of rows) {
    const record = recordOf(row)
    if (!record) continue
    const sourceId = id(record.sourceId)
    if (!sourceId || typeof record.watching !== 'boolean') continue
    flags[sourceId] = record.watching
  }
  return flags
}

export function applyWatcherFlags(lots: readonly ParsedAltLot[], flags: Record<string, boolean>): ParsedAltLot[] {
  return lots.map((lot) => (lot.id in flags ? { ...lot, watching: flags[lot.id] === true } : lot))
}

export function watchingCandidates(lots: readonly ParsedAltLot[], notes: Record<string, AltNote>): string[] {
  const cheapest = new Map<string, ParsedAltLot>()
  for (const lot of lots) {
    if (!lot.watching || lot.hasBid || placementOf(notes[lot.id]) !== 'auto') continue
    const existing = cheapest.get(lot.name)
    if (!existing || cheaperWatch(lot, existing)) cheapest.set(lot.name, lot)
  }
  return [...cheapest.values()].map((lot) => lot.id)
}

function cheaperWatch(a: ParsedAltLot, b: ParsedAltLot): boolean {
  if (a.currentBid === null && b.currentBid === null) return a.id < b.id
  if (a.currentBid === null) return false
  if (b.currentBid === null) return true
  if (a.currentBid !== b.currentBid) return a.currentBid < b.currentBid
  return a.id < b.id
}

export function chooseWatchingIds(
  eligible: readonly string[],
  previous: readonly string[],
  refresh: boolean,
  random: () => number = Math.random
): string[] {
  const allowed = new Set(eligible)
  if (!refresh) {
    const kept = previous.filter((id, index) => allowed.has(id) && previous.indexOf(id) === index).slice(0, WATCHING_SAMPLE_LIMIT)
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
  return pool.slice(0, WATCHING_SAMPLE_LIMIT)
}

export function parseStytchSession(payload: unknown): { sessionToken: string; sessionJwt: string } | null {
  const root = recordOf(payload)
  const nested = recordOf(root?.data)
  const source = nested?.session_token || nested?.session_jwt ? nested : root
  const sessionToken = text(source?.session_token)
  const sessionJwt = text(source?.session_jwt)
  if (!sessionToken || !sessionJwt) return null
  return { sessionToken, sessionJwt }
}

export function parseWatchToggle(payload: unknown): { ok: true; watching: boolean } | { ok: false; message: string } {
  const data = recordOf(recordOf(payload)?.data)
  const toggle = recordOf(data?.toggleUnviersalWatchlist)
  const result = recordOf(toggle?.result)
  if (typeof result?.watching === 'boolean') return { ok: true, watching: result.watching }
  const error = recordOf(toggle?.error)
  const message = text(error?.message)
  return { ok: false, message: message || 'That lot could not be updated on Alt.' }
}

function placementOf(note: AltNote | undefined): AltPlacement {
  return note?.placement === 'pinned' || note?.placement === 'hidden' ? note.placement : 'auto'
}

function rank(item: AltItem): number {
  return item.maxBid ?? item.currentBid ?? Number.NEGATIVE_INFINITY
}

function compareItems(a: AltItem, b: AltItem): number {
  const difference = rank(b) - rank(a)
  if (difference !== 0) return difference
  return a.name.localeCompare(b.name)
}

export function buildAltBoard(
  lots: readonly ParsedAltLot[],
  notes: Record<string, AltNote>,
  watchingIds: readonly string[],
  auction: { ids: readonly string[]; name: string | null }
): AltSnapshot {
  const allowed = new Set(auction.ids)
  const current = allowed.size > 0 ? lots.filter((lot) => allowed.has(lot.auctionCycleId)) : [...lots]
  if (current.length === 0) {
    return { status: 'empty', message: 'No bids or watched lots in the current Alt auction.' }
  }

  const groups: Record<AltSectionId, AltItem[]> = { pinned: [], winning: [], losing: [], watching: [], hidden: [] }
  const byId = new Map<string, AltItem>()
  let winningCount = 0
  let outbidCount = 0
  let winningCurrentTotal = 0
  let winningMaxTotal = 0

  for (const lot of current) {
    if (lot.status === 'winning') {
      winningCount += 1
      if (lot.currentBid !== null) winningCurrentTotal += lot.currentBid
      if (lot.maxBid !== null) winningMaxTotal += lot.maxBid
    } else if (lot.status === 'outbid') {
      outbidCount += 1
    }

    const note = notes[lot.id]
    const item: AltItem = {
      id: lot.id,
      name: lot.name,
      url: lot.url,
      status: lot.status,
      hasBid: lot.hasBid,
      watching: lot.watching,
      currentBid: lot.currentBid,
      maxBid: lot.maxBid,
      marketPrice: note?.marketPrice ?? null,
      placement: placementOf(note)
    }
    byId.set(item.id, item)
    if (item.placement === 'pinned') groups.pinned.push(item)
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

  const unsampledWatching = watchingCandidates(current, notes).length > 0
  const sections = SECTION_TITLES.flatMap((section) => {
    const items = groups[section.id].sort(compareItems)
    if (items.length === 0 && !(section.id === 'watching' && unsampledWatching)) return []
    return [{ ...section, items }]
  })

  return {
    status: 'ready',
    auctionName: auction.name,
    winningCount,
    outbidCount,
    winningCurrentTotal: Math.round(winningCurrentTotal * 100) / 100,
    winningMaxTotal: Math.round(winningMaxTotal * 100) / 100,
    sections
  }
}

export function formatAltProfit(currentBid: number | null, maxBid: number | null, marketPrice: number): string {
  const reference = maxBid === null ? currentBid : currentBid === null ? maxBid : Math.max(currentBid, maxBid)
  if (reference === null) return ''
  const profit = marketPrice - reference
  const percent = (reference / marketPrice) * 100
  const percentText = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(percent)
  const signed = profit > 0 ? `+${formatUsd(profit)}` : formatUsd(profit)
  return `${signed} · ${percentText}% of market`
}
