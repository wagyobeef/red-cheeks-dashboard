import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { aggregateYearlyOverview, chooseYear, monthlyOverviewForSheet, yearlyOverviewForSheet } from './aggregate'
import { readMonthCell, readMonthYear } from './month'
import { presentYearlyOverview } from './present'
import { SPREADSHEETS_READONLY_SCOPE } from './scope'
import { buildSheetTitlesUrl, buildValuesBatchUrl } from './sheetsUrl'
import { parseSpreadsheetId } from './spreadsheetId'

const HEADERS = ['Month', 'Bought', 'Sold', 'Unresolved', 'Unresolved Cost', 'Profit', 'Notes']

describe('readMonthYear', () => {
  it('reads a month-year like Jan 2026', () => {
    assert.equal(readMonthYear('Jan 2026'), 2026)
    assert.equal(readMonthYear('sep 2025'), 2025)
    assert.equal(readMonthYear('Sept 2026'), 2026)
    assert.equal(readMonthYear('June 2024'), 2024)
    assert.equal(readMonthYear('July 2024'), 2024)
    assert.equal(readMonthYear('Jan-2026'), 2026)
    assert.deepEqual(readMonthCell('January 2026'), { month: 0, year: 2026 })
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

  it('defaults to the current year and can total every year', () => {
    assert.equal(chooseYear([2024, 2025], null, 2026), 2026)
    assert.equal(chooseYear([2024, 2025, 2026], 2025, 2026), 2025)
    assert.equal(chooseYear([2024, 2025], 'all', 2026), 'all')
    const missing = yearlyOverviewForSheet([HEADERS, ['June 2024', 1, 1, 1, 1, 8]], null, 2026)
    assert.equal(missing.status, 'empty')
    if (missing.status !== 'empty') return
    assert.equal(missing.year, 2026)
    assert.deepEqual(missing.years, [2024, 2026])

    const all = yearlyOverviewForSheet(
      [HEADERS, ['June 2024', 1, 2, 1, 1, 8], ['Jan 2026', 3, 4, 1, 1, 10], ['nope', 9, 9, 9, 9, 9]],
      'all',
      2026
    )
    assert.equal(all.status, 'ready')
    if (all.status !== 'ready') return
    assert.equal(all.year, 'all')
    assert.equal(all.profit, 18)
    assert.equal(all.bought, 4)
    assert.equal(all.sold, 6)

    const bad = aggregateYearlyOverview(
      [HEADERS, ['Jan 2026', 1, 1, 1, 1, 8], ['Jan 2024', 'bad', 1, 1, 1, 1]],
      'all'
    )
    assert.equal(bad.status, 'error')
    if (bad.status !== 'error') return
    assert.equal(bad.message, 'Column B in row 3 is not a number.')

    const emptyAll = aggregateYearlyOverview([HEADERS], 'all')
    assert.deepEqual(emptyAll, { status: 'empty', year: 'all', years: [] })
  })
})

describe('monthlyOverviewForSheet', () => {
  const allMonths = [
    ['', '', '', 'Sale price', '', 'Platform', 'Profit', 'Month'],
    ['', '', '', 40, '', 'eBay', 12, 'Jan-2026'],
    ['', '', '', 10, '', 'Card Show', 5, 'January 2026'],
    ['', '', '', 7, '', 'Shop', 3, 'March 2025'],
    ['', '', '', 4, '', 'Fanatics', '', 'Sept-2026']
  ]
  const monthSheets = [
    {
      title: 'Jan-2026',
      rows: [
        ['', '', 'Purchase price', '', 'Source'],
        ['', '', 20, '', 'eBay'],
        ['', '', 8, '', 'Card Show'],
        ['', '', '', '', 'Fanatics']
      ]
    },
    {
      title: 'June 2024',
      rows: [['', '', 15, '', 'Alt']]
    }
  ]

  it('sums profit and sale volume by platform and purchase volume from month tabs', () => {
    const result = monthlyOverviewForSheet(allMonths, monthSheets, null, 2026)
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') return
    assert.equal(result.year, 2026)
    assert.equal(result.minYear, 2024)
    assert.equal(result.maxYear, 2026)
    assert.equal(result.profit.status, 'ready')
    assert.equal(result.sale.status, 'ready')
    assert.equal(result.purchase.status, 'ready')
    if (result.profit.status !== 'ready' || result.sale.status !== 'ready' || result.purchase.status !== 'ready') return
    assert.equal(result.profit.values.All[0], 17)
    assert.equal(result.profit.values.eBay[0], 12)
    assert.equal(result.profit.values['Card Show'][0], 5)
    assert.equal(result.sale.values.All[0], 50)
    assert.equal(result.sale.values.eBay[0], 40)
    assert.equal(result.profit.values.All[8], 0)
    assert.equal(result.sale.values.Fanatics[8], 4)
    assert.equal(result.purchase.values.All[0], 28)
    assert.equal(result.purchase.values.eBay[0], 20)
    assert.equal(result.purchase.values['Card Show'][0], 8)
    assert.equal(result.purchase.values.All[1], 0)
    assert.equal(result.profit.values.All[2], 0)
  })

  it('keeps unknown platforms in All, skips blank or non-numeric cells, and stops on a duplicate tab', () => {
    const result = monthlyOverviewForSheet(allMonths, monthSheets, 2025, 2026)
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready' || result.profit.status !== 'ready') return
    assert.equal(result.profit.values.All[2], 3)
    assert.equal(result.profit.values.eBay[2], 0)

    const duplicate = monthlyOverviewForSheet(allMonths, [...monthSheets, { title: 'January 2026', rows: [] }], 2026, 2026)
    assert.equal(duplicate.status, 'error')
    if (duplicate.status !== 'error') return
    assert.equal(duplicate.message, 'Jan 2026 appears more than once.')

    const skipped = monthlyOverviewForSheet(
      [
        ['', '', '', 10, '', 'eBay', 4, 'Mar-2026'],
        ['', '', '', 'n/a', '', 'eBay', '', 'Mar-2026'],
        ['', '', '', 6, '', 'Card Show', 'pending', 'Mar-2026']
      ],
      [{ title: 'Mar-2026', rows: [['', '', 'Purchase price', '', 'Source'], ['', '', 9, '', 'eBay'], ['', '', 'n/a', '', 'eBay']] }],
      2026,
      2026
    )
    assert.equal(skipped.status, 'ready')
    if (skipped.status !== 'ready' || skipped.profit.status !== 'ready' || skipped.sale.status !== 'ready' || skipped.purchase.status !== 'ready') return
    assert.equal(skipped.profit.values.All[2], 4)
    assert.equal(skipped.sale.values.All[2], 16)
    assert.equal(skipped.purchase.values.eBay[2], 9)

    const missing = monthlyOverviewForSheet(null, monthSheets, 2026, 2026)
    assert.equal(missing.status, 'ready')
    if (missing.status !== 'ready') return
    assert.equal(missing.profit.status, 'error')
    if (missing.profit.status !== 'error') return
    assert.equal(missing.profit.message, 'The spreadsheet has no AllMonths sheet.')
    assert.equal(missing.purchase.status, 'ready')
  })

  it('defaults to the current year and can step through years with no rows', () => {
    const current = monthlyOverviewForSheet(allMonths, monthSheets, null, 2026)
    assert.equal(current.year, 2026)
    const gap = monthlyOverviewForSheet(allMonths, monthSheets, 2025, 2026)
    assert.equal(gap.status, 'ready')
    if (gap.status !== 'ready' || gap.purchase.status !== 'ready') return
    assert.equal(gap.year, 2025)
    assert.equal(gap.purchase.values.All[0], 0)

    const earlier = monthlyOverviewForSheet([], [{ title: 'June 2024', rows: [['', '', 15, '', 'Alt']] }], 2020, 2026)
    assert.equal(earlier.year, 2024)
    assert.equal(earlier.status, 'ready')
    if (earlier.status !== 'ready' || earlier.purchase.status !== 'ready') return
    assert.equal(earlier.purchase.values.Alt[5], 15)

    const future = monthlyOverviewForSheet(null, [{ title: 'Jan-2028', rows: [] }], null, 2026)
    assert.equal(future.year, 2026)
    assert.equal(future.minYear, 2026)
    assert.equal(future.maxYear, 2028)
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
    assert.equal(presented.profitLabel, 'Profit')
    assert.deepEqual(
      presented.metrics.map((metric) => metric.label),
      ['Purchase volume', 'Sale volume', 'Unresolved items', 'Unresolved costs']
    )
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
    const all = presentYearlyOverview({ status: 'empty', year: 'all', years: [2024] })
    assert.equal(all.status, 'empty')
    if (all.status !== 'empty') return
    assert.equal(all.message, 'No Overall rows.')
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

  it('builds read-only requests for sheet titles and values', () => {
    const titles = new URL(buildSheetTitlesUrl('sheet-id'))
    assert.equal(titles.origin, 'https://sheets.googleapis.com')
    assert.equal(titles.pathname, '/v4/spreadsheets/sheet-id')
    assert.equal(titles.searchParams.get('fields'), 'sheets.properties.title')

    const values = new URL(buildValuesBatchUrl('sheet-id', ['Overall', 'AllMonths', 'Jan-2026']))
    assert.equal(values.pathname, '/v4/spreadsheets/sheet-id/values:batchGet')
    assert.deepEqual(values.searchParams.getAll('ranges'), ['Overall', 'AllMonths', 'Jan-2026'])
    assert.equal(values.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE')
    assert.equal(values.searchParams.get('dateTimeRenderOption'), 'FORMATTED_STRING')
    assert.equal(values.href.includes('batchUpdate'), false)
    assert.equal(values.href.includes(':append'), false)
    assert.equal(SPREADSHEETS_READONLY_SCOPE, 'https://www.googleapis.com/auth/spreadsheets.readonly')
  })
})
