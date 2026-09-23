import type { YearlyOverview, YearlyTotals } from './aggregate'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export type PresentedMetric = { label: string; value: string }

export type PresentedOverview =
  | {
      status: 'ready'
      year: string
      years: number[]
      profitLabel: string
      profit: string
      metrics: PresentedMetric[]
    }
  | {
      status: 'empty'
      year: string
      years: number[]
      message: string
    }
  | { status: 'error'; message: string; years: number[] }

export function formatUsd(value: number): string {
  return usd.format(value)
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2
  }).format(value)
}

function readyMetrics(totals: YearlyTotals): PresentedMetric[] {
  return [
    { label: 'Purchase volume', value: formatUsd(totals.bought) },
    { label: 'Sale volume', value: formatUsd(totals.sold) },
    { label: 'Unresolved items', value: formatCount(totals.unresolvedCount) },
    { label: 'Unresolved costs', value: formatUsd(totals.unresolvedCost) }
  ]
}

export function presentYearlyOverview(overview: YearlyOverview): PresentedOverview {
  if (overview.status === 'error') {
    return { status: 'error', message: overview.message, years: overview.years ?? [] }
  }
  if (overview.status === 'empty') {
    return {
      status: 'empty',
      year: overview.year === 'all' ? 'All' : String(overview.year),
      years: overview.years,
      message: overview.year === 'all' ? 'No Overall rows.' : `No Overall rows for ${overview.year}.`
    }
  }

  return {
    status: 'ready',
    year: overview.year === 'all' ? 'All' : String(overview.year),
    years: overview.years,
    profitLabel: 'Profit',
    profit: formatUsd(overview.profit),
    metrics: readyMetrics(overview)
  }
}
