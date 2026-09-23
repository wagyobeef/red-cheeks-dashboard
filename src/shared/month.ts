const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december'
] as const

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export type MonthCell = { month: number; year: number }

function monthIndex(token: string): number | null {
  const matches = MONTH_NAMES.flatMap((name, index) => (name.startsWith(token) ? [index] : []))
  return matches.length === 1 ? matches[0] : null
}

/** Reads a month-year cell. The month token must be a unique prefix of one full month name. */
export function readMonthCell(value: unknown): MonthCell | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\u00a0/g, ' ').replace(/-/g, ' ').trim()
  const match = /^([A-Za-z]+)\s+(\d{4})$/.exec(normalized)
  if (!match) return null
  const month = monthIndex(match[1].toLowerCase())
  if (month === null) return null
  return { month, year: Number(match[2]) }
}

/** Reads the calendar year from a month-year cell, or null when the cell is unreadable. */
export function readMonthYear(value: unknown): number | null {
  return readMonthCell(value)?.year ?? null
}
