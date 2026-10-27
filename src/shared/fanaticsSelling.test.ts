import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { fanaticsCardUrl } from './fanatics'
import {
  buildSellingBoard,
  calendarDay,
  parseCollectionPage,
  parseSaleOrdersPage,
  pendingPayment,
  salePriceDollars,
  type SoldRecord,
  type VaultCard
} from './fanaticsSelling'

const NOW = Date.parse('2026-10-25T18:00:00Z')

function card(overrides: Partial<VaultCard> = {}): VaultCard {
  return {
    id: 'card-1',
    name: 'Charizard PSA 10',
    cert: '12345678',
    purchasePrice: 40,
    acquiredDay: calendarDay('2026-10-20'),
    status: 'STATUS_CURATED',
    custodyStatus: 'VAULTED',
    buyNow: {
      id: 'list-1',
      listingType: 'FIXED',
      slug: 'charizard',
      listedDay: calendarDay('2026-10-23T18:00:00Z'),
      price: 80,
      favorites: 3,
      backOffice: true
    },
    auction: null,
    payoutListings: [],
    ...overrides
  }
}

function sale(overrides: Partial<SoldRecord> = {}): SoldRecord {
  return {
    listingId: 'sold-1',
    name: 'Blastoise PSA 10',
    invoiceStatus: 'INVOICE_STATUS_NOT_PAID',
    payoutStatus: 'PAYOUT_STATUS_PENDING',
    soldDay: calendarDay('2026-10-25T18:00:00Z'),
    salePrice: 55,
    ...overrides
  }
}

describe('fanatics selling', () => {
  it('maps pending invoices and payouts onto the two payment labels', () => {
    assert.equal(pendingPayment('INVOICE_STATUS_NOT_PAID', 'PAYOUT_STATUS_PENDING'), 'waiting')
    assert.equal(pendingPayment('INVOICE_STATUS_PENDING_PAYMENT', null), 'waiting')
    assert.equal(pendingPayment('INVOICE_STATUS_PAID_IN_FULL', 'PAYOUT_STATUS_PENDING'), 'in-progress')
    assert.equal(pendingPayment('INVOICE_STATUS_PAID_IN_FULL', 'PAYOUT_STATUS_PAID_OUT'), 'in-progress')
    assert.equal(pendingPayment('INVOICE_STATUS_PAID_IN_FULL', 'PAYOUT_STATUS_PAYMENT_RELEASED'), null)
    assert.equal(pendingPayment('INVOICE_STATUS_PROCESSED', 'PAYOUT_STATUS_PAYMENT_RELEASED'), 'waiting')
    assert.equal(pendingPayment('INVOICE_STATUS_CANCELED', 'PAYOUT_STATUS_PENDING'), null)
    assert.equal(pendingPayment('INVOICE_STATUS_BUYER_DEFAULTED', null), null)
  })

  it('uses the accepted offer as the sale price', () => {
    assert.equal(salePriceDollars(10_000, 8_000), 80)
    assert.equal(salePriceDollars(10_000, null), 100)
    assert.equal(salePriceDollars(0, null), null)
  })

  it('reads vault cards and sold orders from the Fanatics payloads', () => {
    const collection = parseCollectionPage({
      collectionsItems: {
        totalCount: 2,
        pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
        edges: [
          {
            node: {
              id: 'card-1',
              title: 'Charizard PSA 10',
              purchasePrice: { amountInCents: 4000, currency: 'USD' },
              purchaseDate: '2026-10-01',
              gradingInfo: { certNumber: '12345678' },
              custodyInfo: {
                __typename: 'CollectionsCustodyVaultInfo',
                custodyStatus: 'VAULTED',
                vaultItem: {
                  id: 'vault-1',
                  status: 'STATUS_CURATED',
                  curatedDate: '2026-10-20',
                  activeBackOfficeListing: {
                    id: 'list-1',
                    listingType: 'FIXED',
                    slug: 'charizard',
                    insertedAt: '2026-10-23T18:00:00Z',
                    askingPrice: { amountInCents: 8000, currency: 'USD' },
                    favoritedCount: 0
                  },
                  pendingPayoutListings: [{ id: 'sold-1', listingType: 'WEEKLY', slug: 'sold-card' }]
                }
              }
            }
          },
          {
            node: {
              id: 'home',
              title: 'Unvaulted card',
              custodyInfo: { __typename: 'CollectionsCustodyUnvaultedInfo', custodyStatus: 'IN_HAND' }
            }
          }
        ]
      }
    })
    assert.equal(collection.total, 2)
    assert.equal(collection.nextCursor, 'cursor-2')
    assert.equal(collection.cards.length, 1)
    assert.equal(collection.cards[0]?.cert, '12345678')
    assert.equal(collection.cards[0]?.purchasePrice, 40)
    assert.equal(collection.cards[0]?.buyNow?.price, 80)
    assert.equal(collection.cards[0]?.buyNow?.favorites, 0)
    assert.equal(collection.cards[0]?.payoutListings[0]?.listingType, 'WEEKLY')
    assert.equal(collection.cards[0]?.custodyStatus, 'VAULTED')

    const orders = parseSaleOrdersPage({
      collectBoGetSaleOrdersBySeller: {
        totalPages: 3,
        total: 40,
        soldRecords: [
          {
            listingId: 'sold-1',
            variantTitle: 'Blastoise PSA 10',
            invoiceStatus: 'INVOICE_STATUS_PAID_IN_FULL',
            payoutStatus: 'PAYOUT_STATUS_PENDING',
            soldAt: '2026-10-25T18:00:00Z',
            soldPriceBuyNowValueInCents: 10_000,
            soldPriceOfferAcceptValueInCents: 5_500
          },
          { listingId: '', variantTitle: 'Missing id' }
        ]
      }
    })
    assert.equal(orders.totalPages, 3)
    assert.equal(orders.sales.length, 1)
    assert.equal(orders.sales[0]?.salePrice, 55)
  })

  it('summarizes the vault and groups listed, pending, and shipping cards', () => {
    const board = buildSellingBoard(
      [
        card(),
        card({
          id: 'card-2',
          name: 'Blastoise PSA 10',
          cert: '888',
          purchasePrice: 25,
          buyNow: null,
          auction: null,
          payoutListings: [{ id: 'sold-1', listingType: 'WEEKLY', slug: 'blastoise', listedDay: null, price: null, favorites: null, backOffice: false }]
        }),
        card({
          id: 'card-3',
          name: 'Venusaur PSA 9',
          cert: null,
          purchasePrice: 10,
          status: 'STATUS_CURATED',
          custodyStatus: 'RETRIEVAL_IN_PROGRESS',
          buyNow: {
            id: 'list-3',
            listingType: 'FIXED',
            slug: 'venusaur',
            listedDay: calendarDay('2026-10-23T18:00:00Z'),
            price: 30,
            favorites: null,
            backOffice: true
          }
        }),
        card({
          id: 'twin-a',
          name: 'Duplicate Name',
          cert: '1',
          purchasePrice: 5,
          buyNow: null
        }),
        card({
          id: 'twin-b',
          name: 'Duplicate Name',
          cert: '2',
          purchasePrice: 9,
          buyNow: null
        })
      ],
      [
        sale(),
        sale({ listingId: 'paid', name: 'Already paid', invoiceStatus: 'INVOICE_STATUS_PAID_IN_FULL', payoutStatus: 'PAYOUT_STATUS_PAYMENT_RELEASED', salePrice: 999 }),
        sale({ listingId: 'offer', name: 'Duplicate Name', invoiceStatus: 'INVOICE_STATUS_PAID_IN_FULL', payoutStatus: 'PAYOUT_STATUS_PENDING', salePrice: 70 })
      ],
      NOW
    )

    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.cardCount, 5)
    assert.equal(board.totalValue, 89)
    assert.equal(board.pendingSalesTotal, 125)
    assert.equal(board.pendingProfit, 30)
    assert.equal(board.listed.length, 1)
    assert.equal(board.listed[0]?.name, 'Charizard PSA 10')
    assert.equal(board.listed[0]?.url, fanaticsCardUrl('buy-now', 'list-1', 'charizard'))
    assert.equal(board.listed[0]?.listingPrice, 80)
    assert.equal(board.listed[0]?.margin, 40)
    assert.equal(board.listed[0]?.favorites, 3)
    assert.equal(board.listed[0]?.daysListed, 2)
    assert.equal(board.listed[0]?.daysOwned, 5)
    assert.deepEqual(
      board.pending.map((item) => [item.name, item.cert, item.purchasePrice, item.profit, item.payment, item.soldOn, item.daysToSale]),
      [
        ['Duplicate Name', null, null, null, 'in-progress', 'Oct 25, 2026', null],
        ['Blastoise PSA 10', '888', 25, 30, 'waiting', 'Oct 25, 2026', 5]
      ]
    )
    assert.equal(board.pending[1]?.url, fanaticsCardUrl('weekly', 'sold-1', 'blastoise'))
    assert.deepEqual(
      board.shipping.map((item) => item.name),
      ['Venusaur PSA 9']
    )
    assert.equal(board.shipping[0]?.url, fanaticsCardUrl('collection', 'card-3'))
    assert.deepEqual(
      board.unlisted.map((item) => [item.name, item.purchasePrice, item.daysOwned]),
      [
        ['Duplicate Name', 9, 5],
        ['Duplicate Name', 5, 5]
      ]
    )
    assert.equal(board.unlisted[0]?.url, fanaticsCardUrl('collection', 'twin-b'))
  })

  it('stays empty when the vault and sold tab have nothing pending', () => {
    const board = buildSellingBoard([], [sale({ invoiceStatus: 'INVOICE_STATUS_PAID_IN_FULL', payoutStatus: 'PAYOUT_STATUS_PAYMENT_RELEASED' })], NOW)
    assert.deepEqual(board, { status: 'empty', message: 'No cards in your Fanatics vault.' })
  })
})
