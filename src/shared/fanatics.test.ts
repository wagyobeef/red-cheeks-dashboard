import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bidPageLabel,
  buildFanaticsBoard,
  fanaticsListingUrl,
  extensionTag,
  formatMarketComparison,
  isFanaticsListingUrl,
  listingAuctionId,
  parseFanaticsListings,
  parseMarketPrice,
  pushLoadStep,
  selectCurrentAuction,
  selectWeeklyAuctionEndingToday,
  type WeeklyAuctionSchedule,
  tokenExpired,
  tokenExpiry,
  withBuyersPremium,
  type ParsedBid
} from './fanatics'

function bid(overrides: Partial<ParsedBid> = {}): ParsedBid {
  return {
    id: 'lot-1',
    name: 'Charizard',
    url: fanaticsListingUrl('lot-1', 'charizard'),
    status: 'winning',
    currentBid: 120,
    maxBid: 180,
    auctionId: 'auction-current',
    auctionName: 'Weekly Auction #249',
    endsAt: Date.parse('2026-10-26T02:00:00Z'),
    auctionStatus: null,
    windowOrdinal: null,
    lastWindowWhenBidWasReceived: null,
    closed: false,
    ...overrides
  }
}

function node(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Pikachu PSA 10',
    slug: 'pikachu-psa-10',
    currentBid: { amountInCents: 10_000, currency: 'USD' },
    states: {
      userBidStatus: 'HIGH_BID',
      userMaxBid: { amountInCents: 15_000, currency: 'USD' },
      isClosed: false
    },
    auction: { id: 'auction-1', name: 'Weekly Auction #249', endsAt: '2026-10-26T02:00:00.000Z' },
    ...overrides
  }
}

describe('fanatics bids', () => {
  it('adds the 20% buyer premium', () => {
    assert.equal(withBuyersPremium(10_000), 120)
    assert.equal(withBuyersPremium(333), 4)
  })

  it('parses open winning and outbid lots and drops closed or unknown rows', () => {
    const bids = parseFanaticsListings({
      data: {
        collectCurrentUserV2: {
          collectListings: {
            edges: [
              { node: node() },
              {
                node: node({
                  id: '22222222-2222-2222-2222-222222222222',
                  title: 'Blastoise',
                  states: { userBidStatus: 'OUTBID', userMaxBid: { amountInCents: 5_000 }, isClosed: false }
                })
              },
              { node: node({ id: 'closed-win', title: 'Won lot', states: { userBidStatus: 'HIGH_BID', userMaxBid: { amountInCents: 100 }, isClosed: true } }) },
              { node: node({ id: 'closed-loss', states: { userBidStatus: 'OUTBID', userMaxBid: { amountInCents: 100 }, isClosed: true } }) },
              { node: node({ id: 'other', states: { userBidStatus: 'NO_BIDS', isClosed: false } }) },
              { node: node() }
            ]
          }
        }
      }
    })

    assert.deepEqual(
      bids.map((item) => [item.name, item.status, item.currentBid, item.maxBid, item.closed]),
      [
        ['Pikachu PSA 10', 'winning', 120, 180, false],
        ['Blastoise', 'outbid', 120, 60, false],
        ['Won lot', 'winning', 120, 1.2, true]
      ]
    )
    assert.equal(bids[0]?.url, fanaticsListingUrl('11111111-1111-1111-1111-111111111111', 'pikachu-psa-10'))
  })

  it('keeps today\u2019s weekly auction through Pacific midnight after it has closed', () => {
    const auctions: WeeklyAuctionSchedule[] = [
      {
        id: 'f39e79a8-38b1-11f1-84df-0a58a9feac02',
        kind: 'CollectWeeklyAuction',
        status: 'EXTENDED_BIDDING',
        endsAt: Date.parse('2026-10-26T02:00:00Z')
      },
      {
        id: 'e49d2952-3331-11f1-b020-0a58a9feac02',
        kind: 'CollectWeeklyAuction',
        status: 'CLOSED',
        endsAt: Date.parse('2026-10-19T02:00:00Z')
      },
      {
        id: '36c51e0a-3e32-11f1-bb5e-0a58a9feac02',
        kind: 'CollectWeeklyAuction',
        status: 'LIVE',
        endsAt: Date.parse('2026-11-02T03:00:00Z')
      },
      {
        id: 'effccd08-3a6a-11f1-b13b-0a58a9feac02',
        kind: 'CollectPremierAuction',
        status: 'CLOSED',
        endsAt: Date.parse('2026-10-26T02:00:00Z')
      }
    ]
    const sundayNight = Date.parse('2026-10-26T06:30:00Z')
    const mondayMidnight = Date.parse('2026-10-26T07:00:00Z')
    assert.equal(selectWeeklyAuctionEndingToday(auctions, sundayNight), 'f39e79a8-38b1-11f1-84df-0a58a9feac02')
    assert.equal(selectWeeklyAuctionEndingToday(auctions, mondayMidnight), null)
    const closedToday = auctions.map((auction) =>
      auction.id === 'f39e79a8-38b1-11f1-84df-0a58a9feac02' ? { ...auction, status: 'CLOSED' } : auction
    )
    assert.equal(selectWeeklyAuctionEndingToday(closedToday, sundayNight), 'f39e79a8-38b1-11f1-84df-0a58a9feac02')
  })

  it('prefers the extended weekly auction that ends today', () => {
    const sundayNight = Date.parse('2026-10-26T06:30:00Z')
    const chosen = selectWeeklyAuctionEndingToday(
      [
        {
          id: '11111111-1111-1111-1111-111111111111',
          kind: 'CollectWeeklyAuction',
          status: 'CLOSED',
          endsAt: Date.parse('2026-10-26T01:00:00Z')
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          kind: 'CollectWeeklyAuction',
          status: 'EXTENDED_BIDDING',
          endsAt: Date.parse('2026-10-26T02:00:00Z')
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          kind: 'CollectWeeklyAuction',
          status: 'LIVE',
          endsAt: Date.parse('2026-10-26T03:00:00Z')
        }
      ],
      sundayNight
    )
    assert.equal(chosen, '22222222-2222-2222-2222-222222222222')
  })

  it('keeps the weekly auction that ends first', () => {
    const selected = selectCurrentAuction([
      bid({ id: 'later', auctionId: 'next', endsAt: Date.parse('2026-11-02T02:00:00Z') }),
      bid({ id: 'now', auctionId: 'this', endsAt: Date.parse('2026-10-26T02:00:00Z') }),
      bid({ id: 'also', auctionId: 'this', endsAt: Date.parse('2026-10-26T02:00:00Z') })
    ])
    assert.deepEqual(selected.map((item) => item.id), ['now', 'also'])
  })

  it('sorts each section by max bid and keeps pinned and hidden out of the status groups', () => {
    const board = buildFanaticsBoard(
      [
        bid({ id: 'low', name: 'Low', maxBid: 50, currentBid: 24 }),
        bid({ id: 'high', name: 'High', maxBid: 200, currentBid: 60 }),
        bid({ id: 'out', name: 'Out', status: 'outbid', maxBid: 90, currentBid: 120 }),
        bid({ id: 'pin', name: 'Pinned outbid', status: 'outbid', maxBid: 40, currentBid: 80 }),
        bid({ id: 'hide', name: 'Hidden winner', maxBid: 300, currentBid: 100 })
      ],
      {
        pin: { marketPrice: 100, placement: 'pinned' },
        hide: { marketPrice: null, placement: 'hidden' }
      }
    )

    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.auctionName, 'Weekly Auction #249')
    assert.equal(board.winningCount, 3)
    assert.equal(board.outbidCount, 2)
    assert.equal(board.winningCurrentTotal, 184)
    assert.equal(board.winningMaxTotal, 550)
    assert.deepEqual(
      board.sections.map((section) => [section.title, section.items.map((item) => item.name)]),
      [
        ['Pinned', ['Pinned outbid']],
        ['Winning', ['High', 'Low']],
        ['Losing', ['Out']],
        ['Hidden', ['Hidden winner']]
      ]
    )
    assert.equal(board.sections[0]?.items[0]?.marketPrice, 100)
  })

  it('counts a won lot in the bid totals after it has ended', () => {
    const board = buildFanaticsBoard(
      [
        bid({ id: 'live', currentBid: 24, maxBid: 50 }),
        bid({ id: 'won', name: 'Won', closed: true, currentBid: 120, maxBid: null })
      ],
      {}
    )
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.winningCount, 1)
    assert.equal(board.winningCurrentTotal, 144)
    assert.equal(board.winningMaxTotal, 170)
    assert.deepEqual(
      board.sections.map((section) => [section.title, section.items.map((item) => item.id)]),
      [
        ['Winning', ['live']],
        ['Won', ['won']]
      ]
    )
    assert.equal(board.sections[1]?.items[0]?.closed, true)
  })

  it('shows won lots when every bid in the auction has closed', () => {
    const board = buildFanaticsBoard(
      [bid({ id: 'won', name: 'Won', closed: true, currentBid: 120, maxBid: null })],
      {}
    )
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.winningCount, 0)
    assert.equal(board.outbidCount, 0)
    assert.equal(board.winningCurrentTotal, 120)
    assert.equal(board.winningMaxTotal, 120)
    assert.deepEqual(
      board.sections.map((section) => [section.id, section.items.map((item) => item.id)]),
      [['won', ['won']]]
    )
  })

  it('puts a hidden won lot in Won and keeps other hidden lots in Hidden', () => {
    const board = buildFanaticsBoard(
      [
        bid({ id: 'open', name: 'Open', currentBid: 24, maxBid: 40 }),
        bid({ id: 'won', name: 'Won', closed: true, currentBid: 80, maxBid: 90 }),
        bid({ id: 'pin', name: 'Pinned win', closed: true, currentBid: 30, maxBid: 200 }),
        bid({ id: 'hideWon', name: 'Hidden win', closed: true, currentBid: 20, maxBid: 10 }),
        bid({ id: 'hideOpen', name: 'Hidden open', currentBid: 12, maxBid: 30 }),
        bid({ id: 'hideOut', name: 'Hidden outbid', status: 'outbid', currentBid: 50, maxBid: 15 }),
        bid({ id: 'out', name: 'Out', status: 'outbid', currentBid: 50, maxBid: 70 })
      ],
      {
        pin: { marketPrice: null, placement: 'pinned' },
        hideWon: { marketPrice: null, placement: 'hidden' },
        hideOpen: { marketPrice: null, placement: 'hidden' },
        hideOut: { marketPrice: null, placement: 'hidden' }
      }
    )
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.winningCount, 2)
    assert.equal(board.outbidCount, 2)
    assert.deepEqual(
      board.sections.map((section) => [section.id, section.items.map((item) => item.id)]),
      [
        ['pinned', ['pin']],
        ['winning', ['open']],
        ['losing', ['out']],
        ['won', ['won', 'hideWon']],
        ['hidden', ['hideOpen', 'hideOut']]
      ]
    )
  })

  it('reads the auction id used to load that auction’s won lots', () => {
    assert.equal(listingAuctionId('WEEKLY:f39e79a8-38b1-11f1-84df-0a58a9feac02'), 'f39e79a8-38b1-11f1-84df-0a58a9feac02')
    assert.equal(listingAuctionId('not-an-id'), null)
  })

  it('tags a lot once extended bidding starts', () => {
    assert.equal(extensionTag('LIVE', 2, 2), null)
    assert.equal(extensionTag('EXTENDED_BIDDING', null, 2), null)
    assert.equal(extensionTag('EXTENDED_BIDDING', 4, 4), 'next-window')
    assert.equal(extensionTag('EXTENDED_BIDDING', 4, 3), 'needs-bid')
    assert.equal(extensionTag('EXTENDED_BIDDING', 4, null), 'needs-bid')
    const board = buildFanaticsBoard(
      [
        bid({ id: 'held', auctionStatus: 'EXTENDED_BIDDING', windowOrdinal: 4, lastWindowWhenBidWasReceived: 4 }),
        bid({ id: 'open', name: 'Open', auctionStatus: 'EXTENDED_BIDDING', windowOrdinal: 4, lastWindowWhenBidWasReceived: 1 })
      ],
      {}
    )
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.deepEqual(
      board.sections[0]?.items.map((item) => [item.id, item.extension]),
      [
        ['held', 'next-window'],
        ['open', 'needs-bid']
      ]
    )
  })

  it('describes profit potential against the higher of the current bid and max bid', () => {
    assert.equal(formatMarketComparison(60, 80, 100), '+$20.00 · 80% of market')
    assert.equal(formatMarketComparison(50, 125, 100), '-$25.00 · 125% of market')
    assert.equal(formatMarketComparison(150, 125, 100), '-$50.00 · 150% of market')
    assert.equal(formatMarketComparison(90, null, 100), '+$10.00 · 90% of market')
    assert.deepEqual(parseMarketPrice(' $1,250.50 '), { ok: true, value: 1250.5 })
    assert.deepEqual(parseMarketPrice(''), { ok: true, value: null })
    assert.deepEqual(parseMarketPrice('nope'), { ok: false })
    assert.equal(isFanaticsListingUrl('https://www.fanaticscollect.com/weekly/abc/card'), true)
    assert.equal(isFanaticsListingUrl('https://example.com/weekly/abc'), false)
  })

  it('keeps finished steps and updates the bid page in place', () => {
    const started = pushLoadStep([], { id: 'session', label: 'Checking your Fanatics session' })
    const withPage = pushLoadStep(started, { id: 'bids', label: bidPageLabel(0, null, 100) })
    const nextPage = pushLoadStep(withPage, { id: 'bids', label: bidPageLabel(1, 250, 100) })
    assert.deepEqual(
      nextPage.map((step) => step.label),
      ['Checking your Fanatics session', 'Loading bids, page 2 of 3']
    )
  })

  it('reads a session token expiry', () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1_700_000_000 })).toString('base64url')
    const token = `header.${payload}.sig`
    assert.equal(tokenExpiry(token), 1_700_000_000)
    assert.equal(tokenExpired(token, 1_700_000_000_000), true)
    assert.equal(tokenExpired(token, 1_699_000_000_000), false)
  })
})
