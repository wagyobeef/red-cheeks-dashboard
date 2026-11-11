import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { altItemUrl, altListingUrl, altMarketplaceUrl } from './alt'
import {
  applyListedFavorites,
  buildAltSellingBoard,
  calendarDay,
  parseAltCardsPage,
  listingWatchType,
  parseAltWatchCounts,
  projectedPayout,
  type AltVaultCard
} from './altSelling'

const NOW = Date.parse('2026-10-25T18:00:00Z')

function card(overrides: Partial<AltVaultCard> = {}): AltVaultCard {
  return {
    id: 'card-1',
    listingId: 'list-1',
    name: 'Charizard PSA 10',
    status: 'LISTED',
    costBasis: 102,
    purchasePrice: 102,
    listPrice: 169,
    lastComp: 200,
    favorites: 12,
    acquiredDay: calendarDay('2026-10-20'),
    soldDay: null,
    salePrice: null,
    payout: null,
    profit: null,
    listingKind: 'listing',
    ...overrides
  }
}

function node(overrides: Record<string, unknown> = {}): unknown {
  return {
    itemId: 'card-1',
    listingId: 'list-1',
    displayName: 'Charizard PSA 10',
    watcherCount: 12,
    itemVaultedDate: null,
    status: { state: 'Listed', stateKey: 'LISTED' },
    lastTransaction: { amount: 200, date: '2026-10-26T00:00:00' },
    purchaseDetails: {
      listPrice: 169,
      costBasis: 102,
      purchaseDate: '2026-10-20',
      purchasePrice: null,
      salePrice: null,
      soldDate: null,
      netPayout: null,
      profit: null
    },
    auctionDetails: { highestBid: null, auctionCycleId: null },
    ...overrides
  }
}

describe('alt selling', () => {
  it('reads collection cards and listing favorites from Alt payloads', () => {
    const cards = parseAltCardsPage({
      data: {
        myCards: [
          node(),
          node({
            itemId: 'sold-1',
            listingId: 'sale-1',
            displayName: 'Blastoise PSA 10',
            status: { state: 'Payment processing', stateKey: 'PAYMENT_INITIATED' },
            purchaseDetails: {
              costBasis: 25,
              purchaseDate: '2026-10-20',
              salePrice: 55,
              netPayout: 50,
              profit: 25,
              soldDate: '2026-10-25T18:00:00Z'
            }
          }),
          node({ itemId: '', displayName: 'Missing id' })
        ]
      }
    })
    assert.equal(cards.length, 2)
    assert.equal(cards[0]?.purchasePrice, 102)
    assert.equal(cards[0]?.lastComp, 200)
    assert.equal(cards[0]?.favorites, null)
    assert.equal(cards[1]?.status, 'PAYMENT_INITIATED')
    assert.equal(cards[1]?.payout, 50)

    const counts = parseAltWatchCounts({
      data: {
        universalWatcherCounts: [
          { sourceId: 'list-1', watchCount: 3, listingType: 'FIXED_PRICE', watching: false },
          { sourceId: 'other', watchCount: 99, listingType: 'AUCTION', watching: true }
        ]
      }
    })
    assert.equal(counts['list-1'], 3)
    assert.equal(applyListedFavorites(cards, counts)[0]?.favorites, 3)
  })

  it('groups vault cards and leaves unvaulted and completed sales out of the totals', () => {
    const board = buildAltSellingBoard(
      [
        card(),
        card({
          id: 'pending-1',
          listingId: 'sale-1',
          name: 'Blastoise PSA 10',
          status: 'PAYMENT_INITIATED',
          costBasis: 25,
          purchasePrice: 25,
          listPrice: 55,
          payout: 50,
          profit: 25,
          soldDay: calendarDay('2026-10-25T18:00:00Z'),
          listingKind: 'listing'
        }),
        card({
          id: 'vault-1',
          listingId: '',
          name: 'Venusaur PSA 9',
          status: 'VAULTED',
          costBasis: 10,
          purchasePrice: 10,
          listPrice: null,
          lastComp: null,
          favorites: null,
          listingKind: null
        }),
        card({
          id: 'home-1',
          listingId: '',
          name: 'At home',
          status: 'UNVAULTED',
          costBasis: 999,
          purchasePrice: 999,
          listingKind: null
        }),
        card({
          id: 'done-1',
          listingId: 'done-sale',
          name: 'Already paid',
          status: 'SOLD',
          payout: 80,
          profit: 10,
          listingKind: 'listing'
        })
      ],
      NOW
    )

    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.cardCount, 2)
    assert.equal(board.totalValue, 112)
    assert.equal(board.pendingSalesTotal, 50)
    assert.equal(board.listed.length, 1)
    assert.equal(board.listed[0]?.name, 'Charizard PSA 10')
    assert.equal(board.listed[0]?.url, altMarketplaceUrl('list-1'))
    assert.equal(board.listed[0]?.listingPrice, 169)
    assert.equal(projectedPayout(169), 153.79)
    assert.equal(board.listed[0]?.projectedPayout, 153.79)
    assert.equal(board.listed[0]?.margin, 51.79)
    assert.equal(board.listed[0]?.lastComp, 200)
    assert.equal(board.listed[0]?.favorites, 12)
    assert.equal(board.listed[0]?.daysOwned, 5)
    assert.deepEqual(
      board.pending.map((item) => [item.name, item.purchasePrice, item.salePrice, item.profit, item.soldOn, item.daysToSale]),
      [['Blastoise PSA 10', 25, 50, 25, 'Oct 25, 2026', 5]]
    )
    assert.equal(board.pending[0]?.url, altMarketplaceUrl('sale-1'))
    assert.deepEqual(
      board.unlisted.map((item) => [item.name, item.purchasePrice, item.daysOwned, item.url]),
      [['Venusaur PSA 9', 10, 5, altItemUrl('vault-1')]]
    )

    const auction = buildAltSellingBoard(
      [
        card({
          id: 'live-1',
          listingId: 'auc-1',
          name: 'Mewtwo PSA 10',
          status: 'LIVE',
          listingKind: 'auction'
        }),
        card({
          id: 'pending-empty',
          listingId: 'sale-2',
          name: 'Pikachu PSA 10',
          status: 'PAYMENT_PENDING',
          payout: null,
          profit: null,
          soldDay: calendarDay('2026-10-25T18:00:00Z'),
          listingKind: 'listing'
        })
      ],
      NOW
    )
    assert.equal(auction.status, 'ready')
    if (auction.status !== 'ready') return
    assert.equal(auction.listed[0]?.url, altListingUrl('auc-1'))
    assert.equal(listingWatchType({ listingKind: 'auction' }), 'AUCTION')
    assert.equal(listingWatchType({ listingKind: 'listing' }), 'FIXED_PRICE')
    assert.equal(auction.pending[0]?.salePrice, null)
    assert.equal(auction.pending[0]?.url, altMarketplaceUrl('sale-2'))
  })

  it('stays empty when the vault has no cards and nothing is pending', () => {
    const board = buildAltSellingBoard(
      [card({ id: 'home', status: 'UNVAULTED', listingKind: null }), card({ id: 'done', status: 'SOLD', payout: 10 })],
      NOW
    )
    assert.deepEqual(board, { status: 'empty', message: 'No cards in your Alt vault.' })
  })
})
