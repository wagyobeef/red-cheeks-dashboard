import { bidPageLabel, type LoadStep } from '../shared/fanatics'
import {
  buildSellingBoard,
  parseCollectionPage,
  parseSaleOrdersPage,
  type SellingSnapshot,
  type SoldRecord,
  type VaultCard
} from '../shared/fanaticsSelling'
import { fanaticsQuery, hasStoredFanaticsSession, whenFanaticsSessionCleared } from './fanatics'

const PAGE_SIZE = 100
const MAX_COLLECTION_PAGES = 40
const MAX_SALE_PAGES = 30

const COLLECTION_QUERY = `
  query webGetCollectionItemsQuery($first: Int, $after: String, $includeAggregates: Boolean!) {
    collectionsItems(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          purchaseDate
          purchasePrice { amountInCents currency }
          gradingInfo { certNumber }
          custodyInfo {
            __typename
            ... on CollectionsCustodyVaultInfo {
              custodyStatus
              vaultItem {
                id
                status
                curatedDate
                activeListing {
                  id
                  listingType
                  slug
                  insertedAt
                  askingPrice { amountInCents currency }
                  currentBid { amountInCents currency }
                  startingPrice { amountInCents currency }
                  favoritedCount
                }
                activeBackOfficeListing {
                  id
                  listingType
                  slug
                  insertedAt
                  askingPrice { amountInCents currency }
                  favoritedCount
                }
                pendingPayoutListings { id listingType slug }
              }
            }
          }
        }
      }
      totalCount @include(if: $includeAggregates)
    }
  }
`

const SALES_QUERY = `
  query webBoGetSaleOrdersBySellerQuery(
    $pageSize: Int
    $pageNumber: Int
    $sortField: CollectBoOrdersSortField
    $sortDirection: CollectBoOrdersSortDirection
  ) {
    collectBoGetSaleOrdersBySeller(
      pageSize: $pageSize
      pageNumber: $pageNumber
      sortField: $sortField
      sortDirection: $sortDirection
      useProSeller: false
    ) {
      totalPages
      total
      soldRecords {
        listingId
        invoiceStatus
        payoutStatus
        soldAt
        variantTitle
        soldPriceBuyNowValueInCents
        soldPriceOfferAcceptValueInCents
      }
    }
  }
`

type Report = (step: LoadStep) => void

const quiet: Report = () => {}

let cache: { cards: VaultCard[]; sales: SoldRecord[] } | null = null

whenFanaticsSessionCleared(() => {
  cache = null
})

async function fetchCollection(report: Report): Promise<VaultCard[]> {
  const cards: VaultCard[] = []
  const seen = new Set<string>()
  let cursor: string | null = null
  let total: number | null = null
  for (let page = 0; page < MAX_COLLECTION_PAGES; page += 1) {
    report({ id: 'collection', label: bidPageLabel(page, total, PAGE_SIZE, 'cards') })
    const data = await fanaticsQuery(
      'webGetCollectionItemsQuery',
      COLLECTION_QUERY,
      { first: PAGE_SIZE, after: cursor, includeAggregates: true },
      report
    )
    const parsed = parseCollectionPage(data)
    if (parsed.total !== null) total = parsed.total
    report({ id: 'collection', label: bidPageLabel(page, total, PAGE_SIZE, 'cards') })
    if (parsed.cards.length === 0 && !parsed.nextCursor) break
    for (const card of parsed.cards) {
      if (seen.has(card.id)) continue
      seen.add(card.id)
      cards.push(card)
    }
    if (!parsed.nextCursor || parsed.nextCursor === cursor) break
    cursor = parsed.nextCursor
  }
  return cards
}

async function fetchSales(report: Report): Promise<SoldRecord[]> {
  const sales: SoldRecord[] = []
  const seen = new Set<string>()
  let total: number | null = null
  for (let page = 0; page < MAX_SALE_PAGES; page += 1) {
    report({ id: 'sales', label: bidPageLabel(page, total, PAGE_SIZE, 'sales') })
    const data = await fanaticsQuery(
      'webBoGetSaleOrdersBySellerQuery',
      SALES_QUERY,
      {
        pageSize: PAGE_SIZE,
        pageNumber: page + 1,
        sortField: 'SORT_FIELD_SOLD_AT',
        sortDirection: 'SORT_DIRECTION_DESC'
      },
      report
    )
    const parsed = parseSaleOrdersPage(data)
    if (parsed.total !== null) total = parsed.total
    report({ id: 'sales', label: bidPageLabel(page, total, PAGE_SIZE, 'sales') })
    if (parsed.sales.length === 0) break
    for (const sale of parsed.sales) {
      if (seen.has(sale.listingId)) continue
      seen.add(sale.listingId)
      sales.push(sale)
    }
    if (parsed.totalPages !== null && page + 1 >= parsed.totalPages) break
  }
  return sales
}

async function fetchSelling(report: Report): Promise<{ cards: VaultCard[]; sales: SoldRecord[] }> {
  const cards = await fetchCollection(report)
  const sales = await fetchSales(report)
  return { cards, sales }
}

export async function sellingBoard(refresh: boolean, report: Report = quiet): Promise<SellingSnapshot> {
  if (!hasStoredFanaticsSession()) return { status: 'signed-out' }
  if (refresh || !cache) cache = await fetchSelling(report)
  report({ id: 'prepare', label: 'Preparing your vault' })
  return buildSellingBoard(cache.cards, cache.sales)
}
