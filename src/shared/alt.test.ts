import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyWatcherFlags,
  altListingUrl,
  buildAltBoard,
  chooseWatchingIds,
  isAltListingUrl,
  parseAuctionName,
  parseLiveAuctionCycleId,
  parseMyAuction,
  parseStytchSession,
  parseWatchToggle,
  parseWatcherFlags,
  watchingCandidates,
  withAltPremium,
  WATCHING_SAMPLE_LIMIT,
  type AltNote,
  type ParsedAltLot
} from './alt'

function lot(overrides: Partial<ParsedAltLot> = {}): ParsedAltLot {
  return {
    id: 'lot-1',
    name: 'Charizard',
    url: altListingUrl('lot-1'),
    status: 'winning',
    hasBid: true,
    watching: false,
    currentBid: 120,
    maxBid: 180,
    auctionCycleId: 'cycle-1',
    ...overrides
  }
}

describe('alt auctions', () => {
  it('adds the 20% buyer’s premium and rounds to cents', () => {
    assert.equal(withAltPremium(100), 120)
    assert.equal(withAltPremium(10.01), 12.01)
  })

  it('reads bids and watched lots from the current bids payload', () => {
    const lots = parseMyAuction({
      data: {
        myAuction: [
          {
            listingId: 'win-1',
            status: 'WINNING',
            currentBid: 100,
            userMaxBid: '150',
            auctionCycleId: 'cycle-1',
            itemDetails: { itemName: 'Pikachu PSA 10' }
          },
          {
            listingId: 'out-1',
            status: 'OUTBID',
            currentBid: 40,
            userMaxBid: 25,
            auctionCycleId: 'cycle-1',
            itemDetails: { itemName: 'Blastoise' }
          },
          {
            listingId: 'watch-1',
            status: 'WATCHING',
            currentBid: 10,
            userMaxBid: null,
            auctionCycleId: 'cycle-1',
            itemDetails: { itemName: 'Venusaur' }
          },
          {
            listingId: 'skip',
            status: 'CLOSED',
            currentBid: 5,
            itemDetails: { itemName: 'Gone' }
          }
        ]
      }
    })

    assert.equal(lots.length, 3)
    assert.equal(lots[0]?.currentBid, 120)
    assert.equal(lots[0]?.maxBid, 180)
    assert.equal(lots[0]?.url, altListingUrl('win-1'))
    assert.equal(lots[1]?.status, 'outbid')
    assert.equal(lots[1]?.maxBid, 30)
    assert.equal(lots[2]?.watching, true)
    assert.equal(lots[2]?.hasBid, false)
    assert.equal(lots[2]?.maxBid, null)
  })

  it('reads the live auction and its name', () => {
    const live = { data: { liveAuctionCycle: { auctionCycle: { id: 'cycle-1' } } } }
    assert.equal(parseLiveAuctionCycleId(live), 'cycle-1')
    assert.equal(
      parseAuctionName({ data: { auctionCycles: [{ id: 'cycle-1', name: 'October Auction' }, { id: 'older', name: 'Old' }] } }, 'cycle-1'),
      'October Auction'
    )
    assert.equal(parseLiveAuctionCycleId({ data: { currentAuctionCycle: { auctionCycle: { id: 'next' } } } }), 'next')
  })

  it('applies watch flags from Alt', () => {
    const flags = parseWatcherFlags({
      data: { universalWatcherCounts: [{ sourceId: 'win-1', watching: true }, { sourceId: 'watch-1', watching: false }] }
    })
    const lots = applyWatcherFlags(
      [lot({ id: 'win-1', watching: false }), lot({ id: 'watch-1', status: 'watching', hasBid: false, watching: true, maxBid: null })],
      flags
    )
    assert.equal(lots[0]?.watching, true)
    assert.equal(lots[1]?.watching, false)
  })

  it('keeps the watched sample until refresh', () => {
    const eligible = ['a', 'b', 'c', 'd']
    assert.deepEqual(chooseWatchingIds(eligible, ['c', 'a', 'missing', 'c'], false), ['c', 'a'])
    const first = chooseWatchingIds(eligible, [], true, () => 0)
    const second = chooseWatchingIds(eligible, [], true, () => 0)
    assert.deepEqual(first, second)
    assert.equal(first.length, 4)
    const many = Array.from({ length: WATCHING_SAMPLE_LIMIT + 5 }, (_, index) => `lot-${index}`)
    assert.equal(chooseWatchingIds(many, [], true, () => 0.5).length, WATCHING_SAMPLE_LIMIT)
    assert.equal(chooseWatchingIds(['a', 'b'], ['missing'], false, () => 0).length, 2)
  })

  it('reads a watch toggle result', () => {
    assert.deepEqual(parseWatchToggle({ data: { toggleUnviersalWatchlist: { result: { watching: false } } } }), {
      ok: true,
      watching: false
    })
    assert.deepEqual(
      parseWatchToggle({ data: { toggleUnviersalWatchlist: { error: { message: 'Sign in again.' } } } }),
      { ok: false, message: 'Sign in again.' }
    )
  })

  it('sorts sections by max bid and keeps the watched sample in Watching', () => {
    const notes: Record<string, AltNote> = {
      pin: { marketPrice: 500, placement: 'pinned' },
      hide: { marketPrice: null, placement: 'hidden' }
    }
    const lots = [
      lot({ id: 'low', name: 'Low', maxBid: 50, currentBid: 24 }),
      lot({ id: 'high', name: 'High', maxBid: 200, currentBid: 60 }),
      lot({ id: 'out', name: 'Out', status: 'outbid', maxBid: 90, currentBid: 120 }),
      lot({ id: 'pin', name: 'Pinned outbid', status: 'outbid', maxBid: 40, currentBid: 80, watching: true }),
      lot({ id: 'hide', name: 'Hidden winner', maxBid: 300, currentBid: 100 }),
      lot({ id: 'seen', name: 'Seen', status: 'watching', hasBid: false, watching: true, currentBid: 80, maxBid: null }),
      lot({ id: 'other', name: 'Other watch', status: 'watching', hasBid: false, watching: true, currentBid: 20, maxBid: null }),
      lot({ id: 'old', name: 'Old cycle', auctionCycleId: 'cycle-old' })
    ]

    const board = buildAltBoard(lots, notes, ['seen'], { id: 'cycle-1', name: 'October Auction' })
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.equal(board.auctionName, 'October Auction')
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
        ['Watching', ['Seen']],
        ['Hidden', ['Hidden winner']]
      ]
    )
    assert.equal(board.sections[0]?.items[0]?.marketPrice, 500)
    assert.equal(board.sections[3]?.refresh, true)
    assert.deepEqual(watchingCandidates(lots.filter((item) => item.auctionCycleId === 'cycle-1'), notes), ['seen', 'other'])
  })

  it('keeps Watching available when the sample is empty', () => {
    const lots = [lot({ id: 'watch', name: 'Watched', status: 'watching', hasBid: false, watching: true, currentBid: 12, maxBid: null })]
    const board = buildAltBoard(lots, {}, [], { id: 'cycle-1', name: null })
    assert.equal(board.status, 'ready')
    if (board.status !== 'ready') return
    assert.deepEqual(
      board.sections.map((section) => [section.id, section.items.length]),
      [['watching', 0]]
    )
  })

  it('reads the Stytch session from the nested authenticate payload', () => {
    assert.deepEqual(
      parseStytchSession({ data: { session_token: 'opaque-token', session_jwt: 'header.payload.sig' } }),
      { sessionToken: 'opaque-token', sessionJwt: 'header.payload.sig' }
    )
    assert.deepEqual(parseStytchSession({ session_token: 'opaque-token', session_jwt: 'header.payload.sig' }), {
      sessionToken: 'opaque-token',
      sessionJwt: 'header.payload.sig'
    })
    assert.equal(parseStytchSession({ data: { status_code: 200 } }), null)
  })

  it('accepts Alt listing urls only', () => {
    assert.equal(isAltListingUrl(altListingUrl('lot-1')), true)
    assert.equal(isAltListingUrl('https://www.alt.xyz/liquid-auctions/current-bids'), false)
    assert.equal(isAltListingUrl('https://www.fanaticscollect.com/weekly/lot-1'), false)
  })
})
