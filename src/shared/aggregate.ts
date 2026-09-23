import { MONTH_LABELS, readMonthCell, readMonthYear } from './month'

const MONTH = { index: 0, label: 'Column A' }
const METRIC_COLUMNS = [
  { field: 'bought', index: 1, label: 'Column B' },
  { field: 'sold', index: 2, label: 'Column C' },
  { field: 'unresolvedCount', index: 3, label: 'Column D' },
  { field: 'unresolvedCost', index: 4, label: 'Column E' },
  { field: 'profit', index: 5, label: 'Column F' }
] as const

type MetricField = (typeof METRIC_COLUMNS)[number]['field']

const USED_WIDTH = 6

export type YearSelection = number | 'all'

export type YearlyTotals = {
  status: 'ready'
  year: YearSelection
  profit: number
  bought: number
  sold: number
  unresolvedCount: number
  unresolvedCost: number
}

export type YearlyOverview =
  | (YearlyTotals & { years: number[] })
  | { status: 'empty'; year: YearSelection; years: number[] }
  | { status: 'error'; message: string; years?: number[] }

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function readMetric(value: unknown, label: string, rowNumber: number): number | string {
  if (isBlank(value)) return 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `${label} in row ${rowNumber} is not a number.`
    return value
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value.trim())
  }
  return `${label} in row ${rowNumber} is not a number.`
}

function isBlankRow(row: unknown[]): boolean {
  return Array.from({ length: USED_WIDTH }, (_, index) => row[index]).every(isBlank)
}

export function listSheetYears(rows: unknown[][]): number[] {
  if (rows.length === 0) return []
  let start = 0
  if (readMonthYear(rows[0]?.[MONTH.index]) === null) start = 1

  const years = new Set<number>()
  for (let index = start; index < rows.length; index += 1) {
    const year = readMonthYear(rows[index]?.[MONTH.index])
    if (year !== null) years.add(year)
  }
  return [...years].sort((left, right) => left - right)
}

export function yearOptions(years: number[], today: number): number[] {
  return [...new Set([...years, today])].sort((left, right) => left - right)
}

export function chooseYear(years: number[], requested: YearSelection | null, today: number): YearSelection {
  if (requested === 'all') return 'all'
  if (typeof requested === 'number' && (years.includes(requested) || requested === today)) return requested
  return today
}

export function yearlyOverviewForSheet(
  rows: unknown[][],
  requestedYear: YearSelection | null,
  today: number
): YearlyOverview {
  if (rows.length === 0) {
    return { status: 'error', message: 'The Overall tab is empty.', years: [] }
  }
  const sheetYears = listSheetYears(rows)
  const overview = aggregateYearlyOverview(rows, chooseYear(sheetYears, requestedYear, today))
  return { ...overview, years: yearOptions(sheetYears, today) }
}

export function aggregateYearlyOverview(rows: unknown[][], year: YearSelection): YearlyOverview {
  if (rows.length === 0) {
    return { status: 'error', message: 'The Overall tab is empty.', years: [] }
  }

  const totals: Record<MetricField, number> = {
    profit: 0,
    bought: 0,
    sold: 0,
    unresolvedCount: 0,
    unresolvedCost: 0
  }
  let matchedRows = 0
  let start = 0
  const firstMonth = rows[0]?.[MONTH.index]
  if (readMonthYear(firstMonth) === null) start = 1

  for (let index = start; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    if (isBlankRow(row)) continue

    const rowYear = readMonthYear(row[MONTH.index])
    if (rowYear === null || (year !== 'all' && rowYear !== year)) continue

    const sheetRow = index + 1
    for (const column of METRIC_COLUMNS) {
      const parsed = readMetric(row[column.index], column.label, sheetRow)
      if (typeof parsed === 'string') return { status: 'error', message: parsed, years: listSheetYears(rows) }
      totals[column.field] += parsed
    }
    matchedRows += 1
  }

  const years = listSheetYears(rows)
  if (matchedRows === 0) return { status: 'empty', year, years }
  return { status: 'ready', year, years, ...totals }
}

export const PLATFORM_OPTIONS = ['All', 'Card Show', 'eBay', 'Fanatics', 'Alt', 'Goldin'] as const

export type PlatformOption = (typeof PLATFORM_OPTIONS)[number]

const NAMED_PLATFORMS = PLATFORM_OPTIONS.filter((platform) => platform !== 'All')

export type PlatformSeries = Record<PlatformOption, number[]>

export type MonthlyMetricSeries = { status: 'ready'; values: PlatformSeries } | { status: 'error'; message: string }

export type MonthSheet = { title: string; rows: unknown[][] }

export type MonthlyOverview = {
  year: number
  minYear: number
  maxYear: number
} & (
  | { status: 'ready'; profit: MonthlyMetricSeries; purchase: MonthlyMetricSeries; sale: MonthlyMetricSeries }
  | { status: 'error'; message: string }
)

const ALL_MONTHS_SALE = 3
const ALL_MONTHS_PLATFORM = 5
const ALL_MONTHS_PROFIT = 6
const ALL_MONTHS_MONTH = 7
const PURCHASE_PRICE = 2
const PURCHASE_SOURCE = 4

function emptyPlatformSeries(): PlatformSeries {
  return {
    All: Array<number>(12).fill(0),
    'Card Show': Array<number>(12).fill(0),
    eBay: Array<number>(12).fill(0),
    Fanatics: Array<number>(12).fill(0),
    Alt: Array<number>(12).fill(0),
    Goldin: Array<number>(12).fill(0)
  }
}

function namedPlatform(value: unknown): (typeof NAMED_PLATFORMS)[number] | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return NAMED_PLATFORMS.find((platform) => platform === name) ?? null
}

function addPlatformValue(series: PlatformSeries, platformCell: unknown, month: number, amount: number): void {
  series.All[month] += amount
  const platform = namedPlatform(platformCell)
  if (platform) series[platform][month] += amount
}

function summable(value: unknown): number | null {
  if (isBlank(value)) return null
  const parsed = readMetric(value, 'Column', 1)
  return typeof parsed === 'number' ? parsed : null
}

function monthlyYears(allMonths: unknown[][] | null, monthSheets: MonthSheet[]): number[] {
  const years = new Set<number>()
  for (const row of allMonths ?? []) {
    const year = readMonthYear(row[ALL_MONTHS_MONTH])
    if (year !== null) years.add(year)
  }
  for (const sheet of monthSheets) {
    const year = readMonthYear(sheet.title)
    if (year !== null) years.add(year)
  }
  return [...years].sort((left, right) => left - right)
}

function duplicateMonthSheet(monthSheets: MonthSheet[], year: number): string | null {
  const seen = new Map<number, string>()
  for (const sheet of monthSheets) {
    const cell = readMonthCell(sheet.title)
    if (cell === null || cell.year !== year) continue
    if (seen.has(cell.month)) return `${MONTH_LABELS[cell.month]} ${year} appears more than once.`
    seen.set(cell.month, sheet.title)
  }
  return null
}

function sumAllMonths(rows: unknown[][], year: number, column: number): PlatformSeries {
  const series = emptyPlatformSeries()
  for (const row of rows) {
    const cell = readMonthCell(row[ALL_MONTHS_MONTH])
    if (cell === null || cell.year !== year) continue
    const parsed = summable(row[column])
    if (parsed === null) continue
    addPlatformValue(series, row[ALL_MONTHS_PLATFORM], cell.month, parsed)
  }
  return series
}

function sumPurchaseSheets(monthSheets: MonthSheet[], year: number): PlatformSeries {
  const series = emptyPlatformSeries()
  for (const sheet of monthSheets) {
    const cell = readMonthCell(sheet.title)
    if (cell === null || cell.year !== year) continue
    for (const row of sheet.rows) {
      const parsed = summable(row[PURCHASE_PRICE])
      if (parsed === null) continue
      addPlatformValue(series, row[PURCHASE_SOURCE], cell.month, parsed)
    }
  }
  return series
}

export type HomeOverview = {
  yearly: YearlyOverview
  monthly: MonthlyOverview
}

export function monthlyYearBounds(years: number[], today: number): { minYear: number; maxYear: number } {
  if (years.length === 0) return { minYear: today, maxYear: today }
  return {
    minYear: Math.min(years[0], today),
    maxYear: Math.max(years[years.length - 1], today)
  }
}

function chooseMonthlyYear(years: number[], requested: number | null, today: number): number {
  const { minYear, maxYear } = monthlyYearBounds(years, today)
  const year = requested ?? today
  if (year < minYear) return minYear
  if (year > maxYear) return maxYear
  return year
}

export function monthlyOverviewForSheet(
  allMonths: unknown[][] | null,
  monthSheets: MonthSheet[],
  requestedYear: number | null,
  today: number
): MonthlyOverview {
  const years = monthlyYears(allMonths, monthSheets)
  const bounds = monthlyYearBounds(years, today)
  const year = chooseMonthlyYear(years, requestedYear, today)
  const duplicate = duplicateMonthSheet(monthSheets, year)
  if (duplicate) return { status: 'error', message: duplicate, year, ...bounds }

  const purchase = sumPurchaseSheets(monthSheets, year)

  const missingAllMonths = { status: 'error' as const, message: 'The spreadsheet has no AllMonths sheet.' }
  if (allMonths === null) {
    return {
      status: 'ready',
      year,
      ...bounds,
      profit: missingAllMonths,
      purchase: { status: 'ready', values: purchase },
      sale: missingAllMonths
    }
  }

  const profit = sumAllMonths(allMonths, year, ALL_MONTHS_PROFIT)
  const sale = sumAllMonths(allMonths, year, ALL_MONTHS_SALE)

  return {
    status: 'ready',
    year,
    ...bounds,
    profit: { status: 'ready', values: profit },
    purchase: { status: 'ready', values: purchase },
    sale: { status: 'ready', values: sale }
  }
}

export function homeOverviewForSheet(
  overall: unknown[][] | null,
  allMonths: unknown[][] | null,
  monthSheets: MonthSheet[],
  requestedYear: YearSelection | null,
  requestedMonthlyYear: number | null,
  today: number
): HomeOverview {
  return {
    yearly:
      overall === null
        ? { status: 'error', message: 'The spreadsheet has no Overall tab.', years: [] }
        : yearlyOverviewForSheet(overall, requestedYear, today),
    monthly: monthlyOverviewForSheet(allMonths, monthSheets, requestedMonthlyYear, today)
  }
}
