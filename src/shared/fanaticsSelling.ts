import { fanaticsCardUrl } from './fanatics'

export type PaymentLabel = 'waiting' | 'in-progress'

export type ListingRef = {
  id: string
  listingType: string | null
  slug: string
  listedDay: number | null
  price: number | null
  favorites: number | null
  backOffice: boolean
}

export type VaultCard = {
  id: string
  name: string
  cert: string | null
  purchasePrice: number | null
  acquiredDay: number | null
  status: string
  custodyStatus: string
  buyNow: ListingRef | null
  auction: ListingRef | null
  payoutListings: ListingRef[]
}

export type SoldRecord = {
  listingId: string
  name: string
  invoiceStatus: string | null
  payoutStatus: string | null
  soldDay: number | null
  salePrice: number | null
}

export type ListedCard = {
  id: string
  name: string
  url: string
  cert: string | null
  purchasePrice: number | null
  listingPrice: number | null
  margin: number | null
  favorites: number | null
  daysListed: number | null
  daysOwned: number | null
}

export type PendingSale = {
  id: string
  name: string
  url: string
  cert: string | null
  purchasePrice: number | null
  salePrice: number
  profit: number | null
  soldOn: string | null
  daysToSale: number | null
  payment: PaymentLabel
}

export type ShipmentCard = {
  id: string
  name: string
  url: string
}

export type UnlistedCard = {
  id: string
  name: string
  url: string
  purchasePrice: number | null
  daysOwned: number | null
}

export type SellingSnapshot =
  | {
      status: 'ready'
      totalValue: number
      cardCount: number
      pendingSalesTotal: number
      pendingProfit: number | null
      listed: ListedCard[]
      pending: PendingSale[]
      shipping: ShipmentCard[]
      unlisted: UnlistedCard[]
    }
  | { status: 'empty'; message: string }
  | { status: 'signed-out' }
  | { status: 'error'; message: string }

const RETRIEVAL_STATUSES = new Set(['RETRIEVAL_IN_PROGRESS', 'STATUS_RETRIEVAL_IN_PROGRESS'])
const PAID_IN_FULL = 'INVOICE_STATUS_PAID_IN_FULL'
const PAYOUT_COMPLETE = 'PAYOUT_STATUS_PAYMENT_RELEASED'
const CLOSED_INVOICES = new Set([
  'INVOICE_STATUS_CANCELED',
  'INVOICE_STATUS_FAILED',
  'INVOICE_STATUS_BUYER_DEFAULTED',
  'INVOICE_STATUS_REFUNDED',
  'INVOICE_STATUS_PENDING_REFUND'
])

export function pendingPayment(invoice: string | null, payout: string | null): PaymentLabel | null {
  if (invoice && CLOSED_INVOICES.has(invoice)) return null
  if (invoice !== PAID_IN_FULL) return 'waiting'
  if (payout === PAYOUT_COMPLETE) return null
  return 'in-progress'
}

export function salePriceDollars(buyNowCents: number | null, offerCents: number | null): number | null {
  const offer = offerCents !== null && offerCents > 0 ? offerCents : null
  const buyNow = buyNowCents !== null && buyNowCents > 0 ? buyNowCents : null
  const cents = offer ?? buyNow
  return cents === null ? null : cents / 100
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function cents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value !== 'object' || value === null || !('amountInCents' in value)) return null
  const amount = (value as { amountInCents: unknown }).amountInCents
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  return Math.round(amount)
}

function dollars(amountCents: number | null): number | null {
  return amountCents === null ? null : amountCents / 100
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
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

export function formatFanaticsDate(dayIndex: number): string {
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

function whole(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.round(value)
}

function listingPrice(record: Record<string, unknown>): number | null {
  return dollars(cents(record.askingPrice)) ?? dollars(cents(record.currentBid)) ?? dollars(cents(record.startingPrice))
}

function listingRef(value: unknown, backOffice: boolean): ListingRef | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const id = text(record.id)
  if (!id) return null
  return {
    id,
    listingType: text(record.listingType) || null,
    slug: text(record.slug),
    listedDay: calendarDay(record.insertedAt),
    price: listingPrice(record),
    favorites: whole(record.favoritedCount),
    backOffice
  }
}

function payoutListing(value: unknown): ListingRef | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const id = text(record.id)
  if (!id) return null
  return {
    id,
    listingType: text(record.listingType) || null,
    slug: text(record.slug),
    listedDay: null,
    price: null,
    favorites: null,
    backOffice: false
  }
}

function parseVaultCard(node: unknown): VaultCard | null {
  if (typeof node !== 'object' || node === null) return null
  const record = node as Record<string, unknown>
  const id = text(record.id)
  const name = text(record.title)
  const custody = typeof record.custodyInfo === 'object' && record.custodyInfo !== null ? (record.custodyInfo as Record<string, unknown>) : null
  const vault = custody && typeof custody.vaultItem === 'object' && custody.vaultItem !== null ? (custody.vaultItem as Record<string, unknown>) : null
  if (!id || !name || !vault || !text(vault.id)) return null
  const grading = typeof record.gradingInfo === 'object' && record.gradingInfo !== null ? (record.gradingInfo as Record<string, unknown>) : null
  const payouts = Array.isArray(vault.pendingPayoutListings) ? vault.pendingPayoutListings.flatMap((item) => {
    const listing = payoutListing(item)
    return listing ? [listing] : []
  }) : []
  return {
    id,
    name,
    cert: text(grading?.certNumber) || null,
    purchasePrice: dollars(cents(record.purchasePrice)),
    acquiredDay: calendarDay(vault.curatedDate) ?? calendarDay(record.purchaseDate),
    status: text(vault.status),
    custodyStatus: text(custody?.custodyStatus),
    buyNow: listingRef(vault.activeBackOfficeListing, true),
    auction: listingRef(vault.activeListing, false),
    payoutListings: payouts
  }
}

export function parseCollectionPage(payload: unknown): { cards: VaultCard[]; nextCursor: string | null; total: number | null } {
  if (typeof payload !== 'object' || payload === null) return { cards: [], nextCursor: null, total: null }
  const connection = (payload as { collectionsItems?: unknown }).collectionsItems
  if (typeof connection !== 'object' || connection === null) return { cards: [], nextCursor: null, total: null }
  const record = connection as Record<string, unknown>
  const edges = Array.isArray(record.edges) ? record.edges : []
  const seen = new Set<string>()
  const cards: VaultCard[] = []
  for (const edge of edges) {
    if (typeof edge !== 'object' || edge === null) continue
    const card = parseVaultCard((edge as { node?: unknown }).node)
    if (!card || seen.has(card.id)) continue
    seen.add(card.id)
    cards.push(card)
  }
  const page = typeof record.pageInfo === 'object' && record.pageInfo !== null ? (record.pageInfo as Record<string, unknown>) : null
  const cursor = page ? text(page.endCursor) : ''
  const nextCursor = page?.hasNextPage === true && cursor ? cursor : null
  const total = typeof record.totalCount === 'number' && Number.isFinite(record.totalCount) ? record.totalCount : null
  return { cards, nextCursor, total }
}

function parseSoldRecord(value: unknown): SoldRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const listingId = text(record.listingId)
  const name = text(record.variantTitle)
  if (!listingId || !name) return null
  return {
    listingId,
    name,
    invoiceStatus: text(record.invoiceStatus) || null,
    payoutStatus: text(record.payoutStatus) || null,
    soldDay: calendarDay(record.soldAt),
    salePrice: salePriceDollars(cents(record.soldPriceBuyNowValueInCents), cents(record.soldPriceOfferAcceptValueInCents))
  }
}

export function parseSaleOrdersPage(payload: unknown): { sales: SoldRecord[]; totalPages: number | null; total: number | null } {
  if (typeof payload !== 'object' || payload === null) return { sales: [], totalPages: null, total: null }
  const connection = (payload as { collectBoGetSaleOrdersBySeller?: unknown }).collectBoGetSaleOrdersBySeller
  if (typeof connection !== 'object' || connection === null) return { sales: [], totalPages: null, total: null }
  const record = connection as Record<string, unknown>
  const rows = Array.isArray(record.soldRecords) ? record.soldRecords : []
  const sales = rows.flatMap((row) => {
    const sale = parseSoldRecord(row)
    return sale ? [sale] : []
  })
  const totalPages = typeof record.totalPages === 'number' && Number.isFinite(record.totalPages) ? record.totalPages : null
  const total = typeof record.total === 'number' && Number.isFinite(record.total) ? record.total : null
  return { sales, totalPages, total }
}

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function activeListing(card: VaultCard): ListingRef | null {
  return card.buyNow ?? card.auction
}

function listedUrl(listing: ListingRef): string {
  if (listing.backOffice) return fanaticsCardUrl('buy-now', listing.id, listing.slug)
  const type = (listing.listingType ?? '').toUpperCase()
  if (type.includes('WEEKLY')) return fanaticsCardUrl('weekly', listing.id, listing.slug)
  if (type.includes('PREMIER')) return fanaticsCardUrl('premier', listing.id, listing.slug)
  if (type.includes('FIXED')) return fanaticsCardUrl('fixed', listing.id, listing.slug)
  return fanaticsCardUrl('buy-now', listing.id, listing.slug)
}

function saleUrl(listing: ListingRef | null, listingId: string, collectionId: string | null): string {
  if (listing) {
    const type = (listing.listingType ?? '').toUpperCase()
    if (type.includes('WEEKLY')) return fanaticsCardUrl('weekly', listing.id, listing.slug)
    if (type.includes('PREMIER')) return fanaticsCardUrl('premier', listing.id, listing.slug)
    return fanaticsCardUrl('buy-now', listing.id || listingId, listing.slug)
  }
  if (listingId) return fanaticsCardUrl('buy-now', listingId)
  if (collectionId) return fanaticsCardUrl('collection', collectionId)
  return ''
}

function matchCard(sale: SoldRecord, cards: readonly VaultCard[]): VaultCard | null {
  if (sale.listingId) {
    const byId = cards.find((card) => card.payoutListings.some((listing) => listing.id === sale.listingId) || card.buyNow?.id === sale.listingId || card.auction?.id === sale.listingId)
    if (byId) return byId
  }
  const titled = cards.filter((card) => normalized(card.name) === normalized(sale.name))
  return titled.length === 1 ? titled[0] : null
}

function byPriceThenName<T extends { name: string }>(price: (item: T) => number | null): (a: T, b: T) => number {
  return (a, b) => {
    const left = price(a) ?? Number.NEGATIVE_INFINITY
    const right = price(b) ?? Number.NEGATIVE_INFINITY
    if (left !== right) return right - left
    return a.name.localeCompare(b.name)
  }
}

export function buildSellingBoard(cards: readonly VaultCard[], sales: readonly SoldRecord[], now = Date.now()): SellingSnapshot {
  const today = pacificDayIndex(now)
  const pendingIds = new Set<string>()
  const pendingCardIds = new Set<string>()
  const pending: PendingSale[] = []
  const seenSales = new Set<string>()

  for (const sale of sales) {
    if (!sale.salePrice || seenSales.has(sale.listingId)) continue
    const payment = pendingPayment(sale.invoiceStatus, sale.payoutStatus)
    if (!payment) continue
    seenSales.add(sale.listingId)
    const card = matchCard(sale, cards)
    if (card) pendingCardIds.add(card.id)
    const listing = card?.payoutListings.find((item) => item.id === sale.listingId) ?? null
    const url = saleUrl(listing, sale.listingId, card?.id ?? null)
    if (!url) continue
    pendingIds.add(sale.listingId)
    const purchase = card?.purchasePrice ?? null
    pending.push({
      id: sale.listingId,
      name: card?.name ?? sale.name,
      url,
      cert: card?.cert ?? null,
      purchasePrice: purchase,
      salePrice: sale.salePrice,
      profit: purchase === null ? null : roundMoney(sale.salePrice - purchase),
      soldOn: sale.soldDay === null ? null : formatFanaticsDate(sale.soldDay),
      daysToSale: daysBetween(card?.acquiredDay ?? null, sale.soldDay),
      payment
    })
  }

  const listed: ListedCard[] = []
  const shipping: ShipmentCard[] = []
  const unlisted: UnlistedCard[] = []
  let totalValue = 0

  for (const card of cards) {
    totalValue += card.purchasePrice ?? 0
    if (RETRIEVAL_STATUSES.has(card.custodyStatus) || RETRIEVAL_STATUSES.has(card.status)) {
      shipping.push({ id: card.id, name: card.name, url: fanaticsCardUrl('collection', card.id) })
      continue
    }
    if (pendingCardIds.has(card.id)) continue
    const listing = activeListing(card)
    if (listing && pendingIds.has(listing.id)) continue
    if (!listing) {
      unlisted.push({
        id: card.id,
        name: card.name,
        url: fanaticsCardUrl('collection', card.id),
        purchasePrice: card.purchasePrice,
        daysOwned: daysBetween(card.acquiredDay, today)
      })
      continue
    }
    listed.push({
      id: card.id,
      name: card.name,
      url: listedUrl(listing),
      cert: card.cert,
      purchasePrice: card.purchasePrice,
      listingPrice: listing.price,
      margin: card.purchasePrice === null || listing.price === null ? null : roundMoney(listing.price - card.purchasePrice),
      favorites: listing.favorites,
      daysListed: daysBetween(listing.listedDay, today),
      daysOwned: daysBetween(card.acquiredDay, today)
    })
  }

  if (cards.length === 0 && pending.length === 0) {
    return { status: 'empty', message: 'No cards in your Fanatics vault.' }
  }

  pending.sort(byPriceThenName((item) => item.salePrice))
  listed.sort(byPriceThenName((item) => item.listingPrice))
  shipping.sort((a, b) => a.name.localeCompare(b.name))
  unlisted.sort(byPriceThenName((item) => item.purchasePrice))

  const knownProfit = pending.filter((item) => item.profit !== null)
  return {
    status: 'ready',
    totalValue: roundMoney(totalValue),
    cardCount: cards.length,
    pendingSalesTotal: roundMoney(pending.reduce((sum, item) => sum + item.salePrice, 0)),
    pendingProfit: knownProfit.length === 0 ? null : roundMoney(knownProfit.reduce((sum, item) => sum + (item.profit ?? 0), 0)),
    listed,
    pending,
    shipping,
    unlisted
  }
}
