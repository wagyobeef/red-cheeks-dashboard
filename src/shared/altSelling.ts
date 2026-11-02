import { altItemUrl, altListingUrl, altMarketplaceUrl } from './alt'

export type AltVaultCard = {
  id: string
  listingId: string
  name: string
  status: string
  costBasis: number | null
  purchasePrice: number | null
  listPrice: number | null
  lastComp: number | null
  favorites: number | null
  acquiredDay: number | null
  listedDay: number | null
  soldDay: number | null
  salePrice: number | null
  payout: number | null
  profit: number | null
  listingKind: 'listing' | 'auction' | null
}

export const ALT_SELLER_PAYOUT_RATE = 0.91

export type AltListedCard = {
  id: string
  name: string
  url: string
  purchasePrice: number | null
  listingPrice: number | null
  projectedPayout: number | null
  margin: number | null
  lastComp: number | null
  favorites: number | null
  daysListed: number | null
  daysOwned: number | null
}

export type AltPendingSale = {
  id: string
  name: string
  url: string
  purchasePrice: number | null
  salePrice: number | null
  profit: number | null
  soldOn: string | null
  daysToSale: number | null
}

export type AltUnlistedCard = {
  id: string
  name: string
  url: string
  purchasePrice: number | null
  daysOwned: number | null
}

export type AltSellingSnapshot =
  | {
      status: 'ready'
      totalValue: number
      cardCount: number
      pendingSalesTotal: number
      listed: AltListedCard[]
      pending: AltPendingSale[]
      unlisted: AltUnlistedCard[]
    }
  | { status: 'empty'; message: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }

const LISTED = new Set(['LISTED', 'COLLATERALIZED_LISTED', 'LIVE', 'SUBMITTED_TO_AUCTION'])
const PENDING = new Set(['PAYMENT_INITIATED', 'PAYMENT_PENDING', 'PENDING_PAYMENT'])
const VAULT_UNLISTED = new Set([
  'VAULTED',
  'VAULTED_CAN_NOT_LIST',
  'COLLATERALIZED',
  'PREVIEW',
  'SENT_TO_GRADING',
  'FLAGGED_BY_QA'
])

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function id(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function money(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.round(parsed * 100) / 100
  }
  return null
}

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function projectedPayout(listingPrice: number | null): number | null {
  if (listingPrice === null) return null
  return roundMoney(listingPrice * ALT_SELLER_PAYOUT_RATE)
}

function pacificDayIndex(ms: number): number | null {
  if (!Number.isFinite(ms)) return null
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(ms)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  if (!year || !month || !day) return null
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function calendarDay(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const trimmed = value.trim()
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    if (!year || !month || !day) return null
    return Date.UTC(year, month - 1, day) / 86_400_000
  }
  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? pacificDayIndex(ms) : null
}

export function formatAltDate(dayIndex: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(dayIndex * 86_400_000)
}

function daysBetween(start: number | null, end: number | null): number | null {
  if (start === null || end === null) return null
  return end - start
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

export function cardStatus(value: unknown): string {
  const record = recordOf(value)
  return text(record?.stateKey) || text(record?.state).toUpperCase().replace(/[\s,]+/g, '_')
}

export function isListedStatus(status: string): boolean {
  return LISTED.has(status)
}

export function isPendingStatus(status: string): boolean {
  return PENDING.has(status)
}

export function isVaultUnlistedStatus(status: string): boolean {
  return VAULT_UNLISTED.has(status)
}

function listingKindOf(status: string, auctionCycleId: string): 'listing' | 'auction' | null {
  if (status === 'LIVE' || status === 'SUBMITTED_TO_AUCTION' || auctionCycleId) return 'auction'
  if (isListedStatus(status)) return 'listing'
  return null
}

function parseCard(value: unknown): AltVaultCard | null {
  const record = recordOf(value)
  if (!record) return null
  const itemId = id(record.itemId)
  const name = text(record.displayName)
  if (!itemId || !name) return null
  const purchase = recordOf(record.purchaseDetails)
  const last = recordOf(record.lastTransaction)
  const auction = recordOf(record.auctionDetails)
  const status = cardStatus(record.status)
  const costBasis = money(purchase?.costBasis) ?? money(purchase?.purchasePrice)
  const payout = money(purchase?.netPayout) ?? money(purchase?.salePrice)
  const profit = money(purchase?.profit)
  return {
    id: itemId,
    listingId: id(record.listingId),
    name,
    status,
    costBasis,
    purchasePrice: costBasis,
    listPrice: money(purchase?.listPrice) ?? money(auction?.highestBid),
    lastComp: money(last?.amount),
    favorites: null,
    acquiredDay: calendarDay(purchase?.purchaseDate) ?? calendarDay(record.itemVaultedDate),
    listedDay: null,
    soldDay: calendarDay(purchase?.soldDate),
    salePrice: payout,
    payout,
    profit: profit === null && costBasis !== null && payout !== null ? roundMoney(payout - costBasis) : profit,
    listingKind: listingKindOf(status, id(auction?.auctionCycleId))
  }
}

export function parseAltCardsPage(payload: unknown): AltVaultCard[] {
  const root = recordOf(payload)
  const data = recordOf(root?.data) ?? root
  const rows = data?.myCards
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const cards: AltVaultCard[] = []
  for (const row of rows) {
    const card = parseCard(row)
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push(card)
  }
  return cards
}

export function parseAltListings(payload: unknown): Record<string, number | null> {
  const root = recordOf(payload)
  const data = recordOf(root?.data) ?? root
  const rows = data?.listings
  const dates: Record<string, number | null> = {}
  if (!Array.isArray(rows)) return dates
  for (const row of rows) {
    const record = recordOf(row)
    const listingId = id(record?.id)
    if (!listingId) continue
    dates[listingId] = calendarDay(record?.createdAt)
  }
  return dates
}

export function applyListedDays(cards: readonly AltVaultCard[], dates: Record<string, number | null>): AltVaultCard[] {
  return cards.map((card) => (card.listingId && card.listingId in dates ? { ...card, listedDay: dates[card.listingId] ?? null } : card))
}

export function listingWatchType(card: Pick<AltVaultCard, 'listingKind'>): 'AUCTION' | 'FIXED_PRICE' {
  return card.listingKind === 'auction' ? 'AUCTION' : 'FIXED_PRICE'
}

export function parseAltWatchCounts(payload: unknown): Record<string, number | null> {
  const root = recordOf(payload)
  const data = recordOf(root?.data) ?? root
  const rows = data?.universalWatcherCounts
  const counts: Record<string, number | null> = {}
  if (!Array.isArray(rows)) return counts
  for (const row of rows) {
    const record = recordOf(row)
    const listingId = id(record?.sourceId)
    if (!listingId) continue
    counts[listingId] = whole(record?.watchCount)
  }
  return counts
}

export function applyListedFavorites(cards: readonly AltVaultCard[], counts: Record<string, number | null>): AltVaultCard[] {
  return cards.map((card) => (card.listingId && card.listingId in counts ? { ...card, favorites: counts[card.listingId] ?? null } : card))
}

function cardUrl(card: AltVaultCard): string {
  if (card.listingId && card.listingKind === 'auction') return altListingUrl(card.listingId)
  if (card.listingId && (card.listingKind === 'listing' || isListedStatus(card.status) || isPendingStatus(card.status))) {
    return altMarketplaceUrl(card.listingId)
  }
  return altItemUrl(card.id)
}

function byPriceThenName<T extends { name: string }>(price: (item: T) => number | null): (a: T, b: T) => number {
  return (a, b) => {
    const left = price(a) ?? Number.NEGATIVE_INFINITY
    const right = price(b) ?? Number.NEGATIVE_INFINITY
    if (left !== right) return right - left
    return a.name.localeCompare(b.name)
  }
}

export function buildAltSellingBoard(cards: readonly AltVaultCard[], now = Date.now()): AltSellingSnapshot {
  const today = pacificDayIndex(now)
  const listed: AltListedCard[] = []
  const pending: AltPendingSale[] = []
  const unlisted: AltUnlistedCard[] = []
  let totalValue = 0
  let cardCount = 0

  for (const card of cards) {
    if (isPendingStatus(card.status)) {
      pending.push({
        id: card.id,
        name: card.name,
        url: cardUrl(card),
        purchasePrice: card.purchasePrice,
        salePrice: card.payout,
        profit: card.profit,
        soldOn: card.soldDay === null ? null : formatAltDate(card.soldDay),
        daysToSale: daysBetween(card.acquiredDay, card.soldDay)
      })
      continue
    }
    if (isListedStatus(card.status)) {
      cardCount += 1
      totalValue += card.purchasePrice ?? 0
      const payout = projectedPayout(card.listPrice)
      listed.push({
        id: card.id,
        name: card.name,
        url: cardUrl(card),
        purchasePrice: card.purchasePrice,
        listingPrice: card.listPrice,
        projectedPayout: payout,
        margin: card.purchasePrice === null || payout === null ? null : roundMoney(payout - card.purchasePrice),
        lastComp: card.lastComp,
        favorites: card.favorites,
        daysListed: daysBetween(card.listedDay, today),
        daysOwned: daysBetween(card.acquiredDay, today)
      })
      continue
    }
    if (!isVaultUnlistedStatus(card.status)) continue
    cardCount += 1
    totalValue += card.purchasePrice ?? 0
    unlisted.push({
      id: card.id,
      name: card.name,
      url: cardUrl({ ...card, listingKind: null }),
      purchasePrice: card.purchasePrice,
      daysOwned: daysBetween(card.acquiredDay, today)
    })
  }

  if (cardCount === 0 && pending.length === 0) {
    return { status: 'empty', message: 'No cards in your Alt vault.' }
  }

  listed.sort(byPriceThenName((item) => item.listingPrice))
  pending.sort(byPriceThenName((item) => item.salePrice))
  unlisted.sort(byPriceThenName((item) => item.purchasePrice))

  return {
    status: 'ready',
    totalValue: roundMoney(totalValue),
    cardCount,
    pendingSalesTotal: roundMoney(pending.reduce((sum, item) => sum + (item.salePrice ?? 0), 0)),
    listed,
    pending,
    unlisted
  }
}
