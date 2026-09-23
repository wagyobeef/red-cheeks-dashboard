import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregateYearlyOverview, chooseYear, monthlyOverviewForSheet, yearlyOverviewForSheet } from './aggregate'
import { readMonthCell, readMonthYear } from './month'
import { presentYearlyOverview } from './present'
import { SPREADSHEETS_READONLY_SCOPE } from './scope'
import { buildOverallValuesUrl } from './sheetsUrl'
import { parseSpreadsheetId } from './spreadsheetId'

const HEADERS = ['Month', 'Bought', 'Sold', 'Unresolved', 'Unresolved Cost', 'Profit', 'Notes']

describe('readMonthYear', () => {
  it('reads a month-year like Jan 2026', () => {
    assert.equal(readMonthYear('Jan 2026'), 2026)
    assert.equal(readMonthYear('sep 2025'), 2025)
    assert.equal(readMonthYear('Sept 2026'), 2026)
    assert.equal(readMonthYear('June 2024'), 2024)
    assert.equal(readMonthYear('July 2024'), 2024)
    assert.equal(readMonthYear('January 2026'), 2026)
    assert.equal(readMonthYear('September 2026'), 2026)
    assert.equal(readMonthYear('Ja 2026'), 2026)
    assert.deepEqual(readMonthCell('Sept 2026'), { month: 8, year: 2026 })
    assert.equal(readMonthYear(' Dec\u00a02024 '), 2024)
  })

  it('rejects other shapes', () => {
    assert.equal(readMonthYear('Ju 2026'), null)
    assert.equal(readMonthYear('Ma 2026'), null)
    assert.equal(readMonthYear('2026-01'), null)
    assert.equal(readMonthYear('Abc 2026'), null)
    assert.equal(readMonthYear('Jan 26'), null)
    assert.equal(readMonthYear(44927), null)
    assert.equal(readMonthYear(''), null)
    assert.equal(readMonthYear(null), null)
  })
})

describe('aggregateYearlyOverview', () => {
  it('sums the current calendar year and skips unreadable months', () => {
    const result = aggregateYearlyOverview(
      [
        HEADERS,
        ['Jan 2026', 40, 80, 2, 15, 100, 'ignore'],
        ['Feb 2026', 10, 20, 1, 5, 50],
        ['Jan 2025', 999, 999, 9, 9, 999],
        ['', 1, 1, 1, 1, 1],
        ['nope', 1, 1, 1, 1, 1],
        ['', '', '', '', '', '']
      ],
      2026
    )

    assert.deepEqual(result, {
      status: 'ready',
      year: 2026,
      profit: 150,
      bought: 50,
      sold: 100,
      unresolvedCount: 3,
      unresolvedCost: 20,
      years: [2025, 2026]
    })
  })

  it('treats a blank number as zero and reads columns by position', () => {
    const result = aggregateYearlyOverview([['Mar 2026', '', undefined, 4, null, '25.5', 999]], 2026)

    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.profit, 25.5)
    assert.equal(result.bought, 0)
    assert.equal(result.sold, 0)
    assert.equal(result.unresolvedCount, 4)
    assert.equal(result.unresolvedCost, 0)
  })

  it('returns an empty year instead of zeros when nothing matches', () => {
    const result = aggregateYearlyOverview([HEADERS, ['Jan 2025', 10, 10, 1, 1, 10]], 2026)
    assert.deepEqual(result, { status: 'empty', year: 2026, years: [2025] })
  })

  it('returns zeros when the current year is present and sums to zero', () => {
    const result = aggregateYearlyOverview([HEADERS, ['Jan 2026', 0, 0, 0, 0, 0]], 2026)
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.profit, 0)
    assert.equal(result.unresolvedCount, 0)
  })

  it('stops the load when a current-year cell is not a number', () => {
    const result = aggregateYearlyOverview(
      [HEADERS, ['Jan 2026', 1, 1, 1, 1, '$12'], ['Feb 2026', 5, 5, 5, 5, 5]],
      2026
    )
    assert.deepEqual(result, {
      status: 'error',
      message: 'Column F in row 2 is not a number.',
      years: [2026]
    })
  })

  it('does not fail the load for a bad number on a skipped or other-year row', () => {
    const result = aggregateYearlyOverview(
      [HEADERS, ['Jan 2026', 1, 1, 1, 1, 8], ['nope', 'bad', 1, 1, 1, 1], ['Jan 2024', 'bad', 1, 1, 1, 1]],
      2026
    )
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.profit, 8)
  })

  it('ignores a header row and does not require header names', () => {
    assert.deepEqual(aggregateYearlyOverview([], 2026), {
      status: 'error',
      message: 'The Overall tab is empty.',
      years: []
    })
    assert.deepEqual(aggregateYearlyOverview([HEADERS], 2026), {
      status: 'empty',
      year: 2026,
      years: []
    })
    const result = aggregateYearlyOverview([['Jan 2026', 5]], 2026)
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.bought, 5)
    assert.equal(result.profit, 0)
  })
})

describe('yearlyOverviewForSheet', () => {
  const rows = [
    HEADERS,
    ['Jan 2024', 1, 1, 1, 1, 10],
    ['Sept 2026', 2, 2, 2, 2, 30],
    ['Jan 2025', 3, 3, 3, 3, 20]
  ]

  it('starts on the current year and can switch to another year in the sheet', () => {
    const current = yearlyOverviewForSheet(rows, null, 2026)
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') return
    assert.equal(current.year, 2026)
    assert.deepEqual(current.years, [2024, 2025, 2026])
    assert.equal(current.profit, 30)

    const earlier = yearlyOverviewForSheet(rows, 2024, 2026)
    assert.equal(earlier.status, 'ready')
    if (earlier.status !== 'ready') return
    assert.equal(earlier.year, 2024)
    assert.equal(earlier.profit, 10)
  })

  it('uses the latest sheet year when the current year is absent', () => {
    assert.equal(chooseYear([2024, 2025], null, 2026), 2025)
    assert.equal(chooseYear([2024, 2025, 2026], 2025, 2026), 2025)
    const overview = yearlyOverviewForSheet([HEADERS, ['June 2024', 1, 1, 1, 1, 8]], null, 2026)
    assert.equal(overview.status, 'ready')
    if (overview.status !== 'ready') return
    assert.equal(overview.year, 2024)
  })
})

describe('monthlyOverviewForSheet', () => {
  const zeros = Array<number>(12).fill(0)

  it('charts every month and reads sale volume from column G', () => {
    const result = monthlyOverviewForSheet(
      [
        HEADERS,
        ['Jan 2026', 10, 999, 1, 1, 5, 40],
        ['September 2026', 0, 999, 0, 0, -8, ''],
        ['March 2025', 7, 7, 7, 7, 7, 7],
        ['Ju 2026', 50, 50, 50, 50, 50, 50]
      ],
      null,
      2026
    )

    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.year, 2026)
    assert.equal(result.minYear, 2025)
    assert.equal(result.maxYear, 2026)
    assert.equal(result.bought[0], 10)
    assert.equal(result.profit[0], 5)
    assert.equal(result.sold[0], 40)
    assert.equal(result.profit[8], -8)
    assert.equal(result.sold[8], 0)
    assert.equal(result.profit[1], 0)
    assert.equal(result.bought[2], 0)
    assert.deepEqual(result.profit.slice(1, 8), zeros.slice(1, 8))
  })

  it('uses a zero bar for a blank cell and stops on a duplicate month or a bad number', () => {
    const blank = monthlyOverviewForSheet([['Feb 2026', '', 1, 1, 1, '', '']], 2026, 2026)
    assert.equal(blank.status, 'ready')
    if (blank.status !== 'ready') return
    assert.equal(blank.bought[1], 0)
    assert.equal(blank.profit[1], 0)
    assert.equal(blank.sold[1], 0)

    const duplicate = monthlyOverviewForSheet(
      [
        ['Jan 2026', 1, 1, 1, 1, 1, 1],
        ['January 2026', 2, 2, 2, 2, 2, 2]
      ],
      2026,
      2026
    )
    assert.deepEqual(duplicate, {
      status: 'error',
      message: 'Jan 2026 appears more than once.',
      year: 2026,
      minYear: 2026,
      maxYear: 2026
    })

    const yearly = aggregateYearlyOverview(
      [
        ['Jan 2026', 1, 1, 1, 1, 4, 9],
        ['January 2026', 1, 1, 1, 1, 6, 9]
      ],
      2026
    )
    assert.equal(yearly.status, 'ready')
    if (yearly.status !== 'ready') return
    assert.equal(yearly.profit, 10)

    const bad = monthlyOverviewForSheet([['Mar 2026', 1, 1, 1, 1, 1, 'n/a']], 2026, 2026)
    assert.equal(bad.status, 'error')
    if (bad.status !== 'error') return
    assert.equal(bad.message, 'Column G in row 1 is not a number.')
  })

  it('defaults to the current year and can step through years with no rows', () => {
    const rows = [
      HEADERS,
      ['June 2024', 3, 1, 1, 1, 8, 4]
    ]
    const current = monthlyOverviewForSheet(rows, null, 2026)
    assert.equal(current.status, 'ready')
    if (current.status !== 'ready') return
    assert.equal(current.year, 2026)
    assert.equal(current.minYear, 2024)
    assert.equal(current.maxYear, 2026)
    assert.deepEqual(current.profit, zeros)

    const gap = monthlyOverviewForSheet(rows, 2025, 2026)
    assert.equal(gap.status, 'ready')
    if (gap.status !== 'ready') return
    assert.equal(gap.year, 2025)
    assert.deepEqual(gap.bought, zeros)

    const earlier = monthlyOverviewForSheet(rows, 2020, 2026)
    assert.equal(earlier.year, 2024)
    assert.equal(earlier.status, 'ready')
    if (earlier.status !== 'ready') return
    assert.equal(earlier.bought[5], 3)
    assert.equal(earlier.sold[5], 4)
    assert.equal(earlier.profit[5], 8)

    const futureSheet = monthlyOverviewForSheet([['Jan 2028', 1, 1, 1, 1, 2, 3]], null, 2026)
    assert.equal(futureSheet.year, 2026)
    assert.equal(futureSheet.minYear, 2026)
    assert.equal(futureSheet.maxYear, 2028)
  })
})

describe('presentYearlyOverview', () => {
  it('formats money and counts', () => {
    const presented = presentYearlyOverview({
      status: 'ready',
      year: 2026,
      profit: 1500.5,
      bought: 40,
      sold: -20,
      unresolvedCount: 1500,
      unresolvedCost: 0,
      years: [2026]
    })

    assert.equal(presented.status, 'ready')
    if (presented.status !== 'ready') return
    assert.equal(presented.profitLabel, 'Year-to-date profit')
    assert.equal(presented.profit, '$1,500.50')
    assert.deepEqual(
      presented.metrics.map((metric) => metric.value),
      ['$40.00', '-$20.00', '1,500', '$0.00']
    )
  })

  it('keeps an empty year distinct from a zero total', () => {
    const presented = presentYearlyOverview({ status: 'empty', year: 2026, years: [] })
    assert.deepEqual(presented, {
      status: 'empty',
      year: '2026',
      years: [],
      message: 'No Overall rows for 2026.'
    })
  })
})

describe('spreadsheet id and read-only request', () => {
  it('reads an id from a sheet URL or a raw id', () => {
    assert.equal(
      parseSpreadsheetId('https://docs.google.com/spreadsheets/d/abc123_XYZ-long/edit#gid=0'),
      'abc123_XYZ-long'
    )
    assert.equal(parseSpreadsheetId('abc123_XYZ-long'), 'abc123_XYZ-long')
    assert.equal(parseSpreadsheetId('https://example.com/not-a-sheet'), null)
    assert.equal(parseSpreadsheetId('Overall'), null)
  })

  it('builds a read of the Overall values and nothing else', () => {
    const url = new URL(buildOverallValuesUrl('sheet-id'))
    assert.equal(url.origin, 'https://sheets.googleapis.com')
    assert.equal(url.pathname, '/v4/spreadsheets/sheet-id/values/Overall')
    assert.equal(url.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE')
    assert.equal(url.searchParams.get('dateTimeRenderOption'), 'FORMATTED_STRING')
    assert.equal(url.href.includes('batchUpdate'), false)
    assert.equal(url.href.includes(':append'), false)
    assert.equal(SPREADSHEETS_READONLY_SCOPE, 'https://www.googleapis.com/auth/spreadsheets.readonly')
  })
})
