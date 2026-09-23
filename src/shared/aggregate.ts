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

export type YearlyTotals = {
  status: 'ready'
  year: number
  profit: number
  bought: number
  sold: number
  unresolvedCount: number
  unresolvedCost: number
}

export type YearlyOverview =
  | (YearlyTotals & { years: number[] })
  | { status: 'empty'; year: number; years: number[] }
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

export function chooseYear(years: number[], requested: number | null, today: number): number {
  if (requested !== null && years.includes(requested)) return requested
  if (years.includes(today)) return today
  return years[years.length - 1] ?? today
}

export function yearlyOverviewForSheet(
  rows: unknown[][],
  requestedYear: number | null,
  today: number
): YearlyOverview {
  const years = listSheetYears(rows)
  const overview = aggregateYearlyOverview(rows, chooseYear(years, requestedYear, today))
  return { ...overview, years }
}

export function aggregateYearlyOverview(rows: unknown[][], year: number): YearlyOverview {
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
    if (rowYear === null || rowYear !== year) continue

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

/** Monthly sale volume is column G. Yearly sale volume stays column C. */
const MONTHLY_COLUMNS = [
  { field: 'bought', index: 1, label: 'Column B' },
  { field: 'profit', index: 5, label: 'Column F' },
  { field: 'sold', index: 6, label: 'Column G' }
] as const

type MonthlyField = (typeof MONTHLY_COLUMNS)[number]['field']

export type MonthlyOverview = {
  year: number
  minYear: number
  maxYear: number
} & (
  | { status: 'ready'; profit: number[]; bought: number[]; sold: number[] }
  | { status: 'error'; message: string }
)

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
  rows: unknown[][],
  requestedYear: number | null,
  today: number
): MonthlyOverview {
  const years = listSheetYears(rows)
  const bounds = monthlyYearBounds(years, today)
  const year = chooseMonthlyYear(years, requestedYear, today)
  if (rows.length === 0) {
    return { status: 'error', message: 'The Overall tab is empty.', year, ...bounds }
  }

  const totals: Record<MonthlyField, number[]> = {
    profit: Array<number>(12).fill(0),
    bought: Array<number>(12).fill(0),
    sold: Array<number>(12).fill(0)
  }
  const seen = new Set<number>()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? []
    const cell = readMonthCell(row[MONTH.index])
    if (cell === null || cell.year !== year) continue
    if (seen.has(cell.month)) {
      return {
        status: 'error',
        message: `${MONTH_LABELS[cell.month]} ${year} appears more than once.`,
        year,
        ...bounds
      }
    }
    seen.add(cell.month)

    const sheetRow = index + 1
    for (const column of MONTHLY_COLUMNS) {
      const parsed = readMetric(row[column.index], column.label, sheetRow)
      if (typeof parsed === 'string') return { status: 'error', message: parsed, year, ...bounds }
      totals[column.field][cell.month] = parsed
    }
  }

  return { status: 'ready', year, ...bounds, ...totals }
}

export function homeOverviewForSheet(
  rows: unknown[][],
  requestedYear: number | null,
  requestedMonthlyYear: number | null,
  today: number
): HomeOverview {
  return {
    yearly: yearlyOverviewForSheet(rows, requestedYear, today),
    monthly: monthlyOverviewForSheet(rows, requestedMonthlyYear, today)
  }
}
