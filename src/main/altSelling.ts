import { bidPageLabel, type LoadStep } from '../shared/fanatics'
import {
  applyListedFavorites,
  buildAltSellingBoard,
  isListedStatus,
  listingWatchType,
  parseAltCardsPage,
  parseAltWatchCounts,
  type AltSellingSnapshot,
  type AltVaultCard
} from '../shared/altSelling'
import { altQuery, hasStoredAltSession, whenAltSessionCleared } from './alt'
import { logSafe, UserFacingError } from './errors'

const PAGE_SIZE = 24
const MAX_CARD_PAGES = 40
const WATCH_BATCH = 25

const CARDS_QUERY = `
  query MyCollection($input: MyCardsInput!) {
    myCards(input: $input) {
      itemId
      listingId
      displayName
      itemVaultedDate
      status { state message stateKey }
      lastTransaction { amount date }
      purchaseDetails {
        listPrice
        costBasis
        salePrice
        purchaseDate
        purchasePrice
        soldDate
        netPayout
        profit
      }
      auctionDetails { highestBid highestBidWithBp auctionCycleId }
    }
  }
`

const WATCH_COUNTS_QUERY = `
  query UniversalWatcherCounts($input: [UniversalWatcherCountInput!]!) {
    universalWatcherCounts(input: $input) {
      watchCount
      sourceId
      listingType
      watching
    }
  }
`

type Report = (step: LoadStep) => void

const quiet: Report = () => {}

let cache: AltVaultCard[] | null = null

whenAltSessionCleared(() => {
  cache = null
})

async function fetchCardPages(report: Report): Promise<AltVaultCard[]> {
  const cards: AltVaultCard[] = []
  const seen = new Set<string>()
  for (let page = 0; page < MAX_CARD_PAGES; page += 1) {
    report({ id: 'collection', label: bidPageLabel(page, null, PAGE_SIZE, 'cards') })
    const body = await altQuery('MyCollection', CARDS_QUERY, { input: { limit: PAGE_SIZE, offset: page * PAGE_SIZE } }, report)
    const parsed = parseAltCardsPage(body)
    report({ id: 'collection', label: bidPageLabel(page, null, PAGE_SIZE, 'cards') })
    if (parsed.length === 0) break
    for (const card of parsed) {
      if (seen.has(card.id)) continue
      seen.add(card.id)
      cards.push(card)
    }
    if (parsed.length < PAGE_SIZE) break
  }
  return cards
}

async function fetchListedFavorites(cards: readonly AltVaultCard[], report: Report): Promise<Record<string, number | null>> {
  const seen = new Set<string>()
  const listed: AltVaultCard[] = []
  for (const card of cards) {
    if (!card.listingId || !isListedStatus(card.status) || seen.has(card.listingId)) continue
    seen.add(card.listingId)
    listed.push(card)
  }
  const counts: Record<string, number | null> = {}
  if (listed.length === 0) return counts
  for (let index = 0; index < listed.length; index += WATCH_BATCH) {
    const batch = listed.slice(index, index + WATCH_BATCH).map((card) => ({
      sourceId: card.listingId,
      listingType: listingWatchType(card)
    }))
    report({ id: 'favorites', label: 'Checking listing favorites' })
    try {
      const body = await altQuery('UniversalWatcherCounts', WATCH_COUNTS_QUERY, { input: batch }, report)
      Object.assign(counts, parseAltWatchCounts(body))
    } catch (error) {
      if (error instanceof UserFacingError && error.message === 'Sign in again to Alt.') throw error
      logSafe(error)
    }
  }
  return counts
}

async function fetchSelling(report: Report): Promise<AltVaultCard[]> {
  const cards = await fetchCardPages(report)
  const favorites = await fetchListedFavorites(cards, report)
  return applyListedFavorites(cards, favorites)
}

export async function altSellingBoard(refresh: boolean, report: Report = quiet): Promise<AltSellingSnapshot> {
  if (!hasStoredAltSession()) return { status: 'signed-out' }
  if (refresh || !cache) cache = await fetchSelling(report)
  report({ id: 'prepare', label: 'Preparing your vault' })
  return buildAltSellingBoard(cache)
}
