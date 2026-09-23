import type { MonthlyOverview } from '../../shared/aggregate'
import type { ConnectionState } from '../../shared/connection'
import { MONTH_LABELS } from '../../shared/month'
import { formatUsd, presentYearlyOverview, type PresentedOverview } from '../../shared/present'
import './styles.css'

type MonthlyMetric = 'profit' | 'bought' | 'sold'

type Busy = 'save' | 'sign-in' | 'refresh' | null

type FormValues = {
  clientId: string
  clientSecret: string
  spreadsheet: string
}

const appRoot = document.querySelector('#app')
if (!appRoot) throw new Error('Missing app root')

let connection: ConnectionState = {
  clientId: '',
  hasClientSecret: false,
  spreadsheetId: '',
  signedIn: false
}
let mode: 'setup' | 'overview' = 'setup'
let banner: { text: string; tone: 'info' | 'error' } | null = null
let busy: Busy = null
let overview: PresentedOverview | null = null
let monthly: MonthlyOverview | null = null
let sheetYears: number[] = []
let selectedYear: number | null = null
let monthlyYear: number | null = null
let selectedMetric: MonthlyMetric = 'profit'
let overviewRequest = 0

const MONTHLY_METRICS: { id: MonthlyMetric; label: string }[] = [
  { id: 'profit', label: 'Profit' },
  { id: 'sold', label: 'Sale volume' },
  { id: 'bought', label: 'Buy volume' }
]
let form: FormValues = { clientId: '', clientSecret: '', spreadsheet: '' }

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function button(label: string, className: string | undefined, onClick: () => void): HTMLButtonElement {
  const node = el('button', className, label)
  node.type = 'button'
  node.disabled = busy !== null
  node.addEventListener('click', onClick)
  return node
}

function refreshButton(onClick: () => void): HTMLButtonElement {
  const node = el('button', 'icon-button')
  node.type = 'button'
  node.setAttribute('aria-label', 'Refresh')
  node.title = 'Refresh'
  node.disabled = busy !== null
  node.append(refreshIcon())
  node.addEventListener('click', onClick)
  return node
}

function refreshIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  for (const path of ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6']) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    shape.setAttribute('d', path)
    svg.append(shape)
  }
  return svg
}

function field(id: string, label: string, value: string, options: { type?: string; placeholder?: string }): HTMLLabelElement {
  const wrap = el('label')
  wrap.htmlFor = id
  wrap.append(label)
  const input = el('input')
  input.id = id
  input.name = id
  input.type = options.type ?? 'text'
  input.value = value
  input.autocomplete = 'off'
  if (options.placeholder) input.placeholder = options.placeholder
  wrap.append(input)
  return wrap
}

function readForm(): FormValues {
  const clientId = appRoot?.querySelector<HTMLInputElement>('#client-id')
  const clientSecret = appRoot?.querySelector<HTMLInputElement>('#client-secret')
  const spreadsheet = appRoot?.querySelector<HTMLInputElement>('#spreadsheet')
  return {
    clientId: clientId?.value ?? form.clientId,
    clientSecret: clientSecret?.value ?? form.clientSecret,
    spreadsheet: spreadsheet?.value ?? form.spreadsheet
  }
}

function render(): void {
  if (!appRoot) return
  appRoot.replaceChildren()

  const shell = el('div', 'shell')
  const sidebar = el('aside', 'sidebar')
  sidebar.append(el('h1', 'brand', 'Red Cheeks'))
  const nav = el('nav')
  const home = el('div', 'nav-item', 'Home')
  home.setAttribute('aria-current', 'page')
  nav.append(home)
  sidebar.append(nav)

  if (connection.signedIn) {
    const actions = el('div', 'sidebar-actions')
    actions.append(
      button('Edit connection', undefined, () => {
        form = {
          clientId: connection.clientId,
          clientSecret: '',
          spreadsheet: connection.spreadsheetId
        }
        banner = null
        mode = 'setup'
        render()
      }),
      button('Sign out', undefined, () => {
        void signOut()
      })
    )
    sidebar.append(actions)
  }

  const content = el('main', 'content')
  content.append(mode === 'setup' ? setupCard() : overviewStack())
  shell.append(sidebar, content)
  appRoot.append(shell)
  document.documentElement.dataset.ready = 'true'
}

function setupCard(): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Connect your spreadsheet'))
  card.append(
    el(
      'p',
      'lede',
      'Sign in with Google to read the Overall tab. Red Cheeks only requests read-only access and never changes the sheet.'
    )
  )

  const formNode = el('form', 'form')
  formNode.append(
    field('client-id', 'Google OAuth client ID', form.clientId, {}),
    field('client-secret', 'Google OAuth client secret', form.clientSecret, {
      type: 'password',
      placeholder: connection.hasClientSecret ? 'Saved on this Mac' : undefined
    }),
    field('spreadsheet', 'Spreadsheet URL or ID', form.spreadsheet, {})
  )

  const actions = el('div', 'actions')
  actions.append(
    button('Save', undefined, () => {
      void saveConnection(readForm(), false)
    })
  )
  const signIn = el('button', 'primary', 'Sign in with Google')
  signIn.type = 'submit'
  signIn.disabled = busy !== null
  actions.append(signIn)
  if (connection.signedIn) {
    actions.append(
      button('Back', undefined, () => {
        banner = null
        mode = 'overview'
        render()
        void loadOverview(true)
      })
    )
  }
  formNode.append(actions)
  formNode.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveConnection(readForm(), true)
  })
  card.append(formNode)

  if (busy === 'sign-in') card.append(el('p', 'note', 'Waiting for Google sign-in…'))
  if (banner) card.append(el('p', banner.tone === 'error' ? 'note error' : 'note', banner.text))
  return card
}

function yearSwitcher(): HTMLElement {
  const group = el('div', 'years')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Year')
  for (const year of sheetYears) {
    const selected = year === selectedYear
    const node = el('button', selected ? 'year is-selected' : 'year', String(year))
    node.type = 'button'
    node.setAttribute('aria-pressed', selected ? 'true' : 'false')
    node.disabled = busy !== null
    node.addEventListener('click', () => {
      if (busy !== null || year === selectedYear) return
      selectedYear = year
      void loadOverview(false)
    })
    group.append(node)
  }
  return group
}

function overviewStack(): HTMLElement {
  const stack = el('div', 'stack')
  stack.append(yearlyCard(), monthlyCard())
  return stack
}

function chevronIcon(direction: 'left' | 'right'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  const shape = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  shape.setAttribute('d', direction === 'left' ? 'M15 18 9 12l6-6' : 'M9 18l6-6-6-6')
  svg.append(shape)
  return svg
}

function yearChevron(direction: 'left' | 'right', year: number, limit: number): HTMLButtonElement {
  const previous = direction === 'left'
  const node = el('button', 'icon-button chevron')
  node.type = 'button'
  node.setAttribute('aria-label', previous ? 'Previous year' : 'Next year')
  node.disabled = busy !== null || (previous ? year <= limit : year >= limit)
  node.append(chevronIcon(direction))
  node.addEventListener('click', () => {
    if (node.disabled) return
    monthlyYear = year + (previous ? -1 : 1)
    void loadOverview(false)
  })
  return node
}

function metricSelector(): HTMLElement {
  const group = el('div', 'segmented')
  group.setAttribute('role', 'group')
  group.setAttribute('aria-label', 'Metric')
  for (const metric of MONTHLY_METRICS) {
    const selected = metric.id === selectedMetric
    const node = el('button', selected ? 'segment is-selected' : 'segment', metric.label)
    node.type = 'button'
    node.setAttribute('aria-pressed', selected ? 'true' : 'false')
    node.disabled = busy !== null
    node.addEventListener('click', () => {
      if (busy !== null || metric.id === selectedMetric) return
      selectedMetric = metric.id
      render()
    })
    group.append(node)
  }
  return group
}

function formatAxisUsd(value: number): string {
  const abs = Math.abs(value)
  const fractionDigits = Number.isInteger(value) ? 0 : 2
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: abs >= 10000 ? 'compact' : 'standard',
    minimumFractionDigits: abs >= 10000 ? 0 : fractionDigits,
    maximumFractionDigits: abs >= 10000 ? 1 : fractionDigits
  }).format(value)
}

function axisScale(min: number, max: number): { min: number; max: number; ticks: number[] } {
  if (min === 0 && max === 0) return { min: 0, max: 1, ticks: [0, 1] }
  const rough = (max - min) / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const fraction = rough / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  const step = nice * power
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const count = Math.round((niceMax - niceMin) / step)
  const decimals = Math.min(2, Math.max(0, -Math.floor(Math.log10(step))))
  const factor = 10 ** decimals
  const ticks = Array.from({ length: count + 1 }, (_, index) => Math.round((niceMin + step * index) * factor) / factor)
  return { min: niceMin, max: niceMax, ticks }
}

function monthlyChart(values: number[], year: number): HTMLElement {
  const width = 720
  const height = 220
  const padTop = 14
  const padBottom = 28
  const padLeft = 52
  const padRight = 8
  const plotHeight = height - padTop - padBottom
  const plotWidth = width - padLeft - padRight
  const slot = plotWidth / values.length
  const scale = axisScale(Math.min(0, ...values), Math.max(0, ...values))
  const yFor = (value: number) => padTop + ((scale.max - value) / (scale.max - scale.min)) * plotHeight
  const zeroY = yFor(0)

  const canvas = el('div', 'chart-canvas')
  const tip = el('div', 'bar-tip')
  tip.hidden = true
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('role', 'img')
  const metricLabel = MONTHLY_METRICS.find((metric) => metric.id === selectedMetric)?.label ?? 'Metric'
  svg.setAttribute('aria-label', `${metricLabel} by month for ${year}`)

  for (const tick of scale.ticks) {
    const y = yFor(tick)
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    grid.setAttribute('class', tick === 0 ? 'chart-axis' : 'chart-grid')
    grid.setAttribute('x1', String(padLeft))
    grid.setAttribute('x2', String(width - padRight))
    grid.setAttribute('y1', String(y))
    grid.setAttribute('y2', String(y))
    svg.append(grid)

    const tickLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    tickLabel.setAttribute('class', 'chart-tick')
    tickLabel.setAttribute('x', String(padLeft - 8))
    tickLabel.setAttribute('y', String(y))
    tickLabel.setAttribute('text-anchor', 'end')
    tickLabel.setAttribute('dominant-baseline', 'middle')
    tickLabel.textContent = formatAxisUsd(tick)
    svg.append(tickLabel)
  }

  values.forEach((value, index) => {
    const center = padLeft + slot * index + slot / 2
    const barWidth = Math.min(28, slot * 0.58)
    const valueY = yFor(value)
    const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bar.setAttribute('class', 'chart-bar')
    bar.setAttribute('x', String(center - barWidth / 2))
    bar.setAttribute('y', String(Math.min(valueY, zeroY)))
    bar.setAttribute('width', String(barWidth))
    bar.setAttribute('height', String(Math.max(Math.abs(valueY - zeroY), value === 0 ? 0 : 1)))
    bar.setAttribute('rx', '3')
    svg.append(bar)

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('class', 'chart-label')
    label.setAttribute('x', String(center))
    label.setAttribute('y', String(height - 8))
    label.setAttribute('text-anchor', 'middle')
    label.textContent = MONTH_LABELS[index] ?? ''
    svg.append(label)

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    hit.setAttribute('class', 'chart-hit')
    hit.setAttribute('x', String(padLeft + slot * index))
    hit.setAttribute('y', '0')
    hit.setAttribute('width', String(slot))
    hit.setAttribute('height', String(height - padBottom))
    const formatted = formatUsd(value)
    hit.setAttribute('aria-label', `${MONTH_LABELS[index]} ${year} ${formatted}`)
    hit.addEventListener('mouseenter', () => {
      tip.hidden = false
      tip.textContent = formatted
      const percent = (center / width) * 100
      tip.style.left = `${percent}%`
      tip.style.top = `${(Math.min(valueY, zeroY) / height) * 100}%`
      tip.style.transform =
        percent < 12
          ? 'translate(0, calc(-100% - 6px))'
          : percent > 88
            ? 'translate(-100%, calc(-100% - 6px))'
            : 'translate(-50%, calc(-100% - 6px))'
    })
    hit.addEventListener('mouseleave', () => {
      tip.hidden = true
    })
    svg.append(hit)
  })

  canvas.append(tip, svg)
  return canvas
}

function monthlyCard(): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Monthly Overview'))

  if (busy === 'refresh' || !monthly) {
    if (busy !== 'refresh' && overview?.status === 'error') {
      card.append(el('p', 'note error', overview.message))
    } else {
      card.append(el('p', 'lede', 'Reading Overall…'))
    }
    return card
  }

  card.append(metricSelector())
  const row = el('div', 'chart-row')
  row.append(yearChevron('left', monthly.year, monthly.minYear))
  const plot = el('div', 'chart-plot')
  plot.append(el('p', 'chart-year', String(monthly.year)))
  if (monthly.status === 'error') {
    plot.append(el('p', 'note error', monthly.message))
  } else {
    plot.append(monthlyChart(monthly[selectedMetric], monthly.year))
  }
  row.append(plot, yearChevron('right', monthly.year, monthly.maxYear))
  card.append(row)
  return card
}

function yearlyCard(): HTMLElement {
  const card = el('section', 'card')
  const header = el('div', 'card-header')
  const titles = el('div', 'card-titles')
  if (sheetYears.length > 0) titles.append(yearSwitcher())
  titles.append(el('h2', undefined, 'Yearly Overview'))
  header.append(titles)
  header.append(
    refreshButton(() => {
      void loadOverview(true)
    })
  )
  card.append(header)

  if (!overview || busy === 'refresh') {
    card.append(el('p', 'lede', 'Reading Overall…'))
    return card
  }

  if (overview.status === 'error') {
    card.append(el('p', 'note error', overview.message))
    return card
  }

  if (overview.status === 'empty') {
    card.append(el('p', 'lede', overview.message))
    return card
  }

  const profit = el('div', 'profit')
  profit.append(el('p', 'profit-label', overview.profitLabel), el('p', 'profit-value', overview.profit))
  const metrics = el('div', 'metrics')
  for (const metric of overview.metrics) {
    const block = el('div', 'metric')
    block.append(el('p', 'metric-label', metric.label), el('p', 'metric-value', metric.value))
    metrics.append(block)
  }
  card.append(profit, metrics)
  return card
}

async function saveConnection(values: FormValues, thenSignIn: boolean): Promise<void> {
  form = values
  if (!window.redCheeks) {
    banner = { text: 'Open the Red Cheeks app to connect Google.', tone: 'error' }
    render()
    return
  }

  busy = thenSignIn ? 'sign-in' : 'save'
  banner = null
  render()
  const saved = await window.redCheeks.saveConnection(values)
  if (!saved.ok) {
    busy = null
    banner = { text: saved.message, tone: 'error' }
    render()
    return
  }

  connection = await window.redCheeks.getConnection()
  form = { clientId: connection.clientId, clientSecret: '', spreadsheet: connection.spreadsheetId }
  if (!thenSignIn) {
    busy = null
    banner = { text: 'Saved.', tone: 'info' }
    render()
    return
  }

  const signedIn = await window.redCheeks.signIn()
  busy = null
  if (!signedIn.ok) {
    banner = { text: signedIn.message, tone: 'error' }
    connection = await window.redCheeks.getConnection()
    render()
    return
  }

  connection = await window.redCheeks.getConnection()
  mode = 'overview'
  overview = null
  banner = null
  render()
  await loadOverview(true)
}

async function signOut(): Promise<void> {
  if (!window.redCheeks) return
  busy = 'save'
  render()
  await window.redCheeks.signOut()
  connection = await window.redCheeks.getConnection()
  form = { clientId: connection.clientId, clientSecret: '', spreadsheet: connection.spreadsheetId }
  overview = null
  monthly = null
  sheetYears = []
  selectedYear = null
  monthlyYear = null
  selectedMetric = 'profit'
  banner = null
  busy = null
  mode = 'setup'
  render()
}

async function loadOverview(refresh: boolean): Promise<void> {
  if (!window.redCheeks) return
  const request = ++overviewRequest
  if (refresh) {
    busy = 'refresh'
    render()
  }
  const result = await window.redCheeks.getYearlyOverview({ year: selectedYear, monthlyYear, refresh })
  if (request !== overviewRequest) return
  if ('yearly' in result) {
    if (Array.isArray(result.yearly.years)) sheetYears = result.yearly.years
    if (result.yearly.status !== 'error') selectedYear = result.yearly.year
    overview = presentYearlyOverview(result.yearly)
    monthly = result.monthly
    monthlyYear = result.monthly.year
  } else {
    overview = presentYearlyOverview({ status: 'error', message: result.message })
    monthly = null
    monthlyYear = null
  }
  connection = await window.redCheeks.getConnection()
  busy = null
  if (!connection.signedIn) {
    mode = 'setup'
    banner = {
      text: 'yearly' in result ? 'Sign in again to read the spreadsheet.' : result.message,
      tone: 'error'
    }
    overview = null
    monthly = null
    sheetYears = []
    selectedYear = null
    monthlyYear = null
    selectedMetric = 'profit'
  }
  render()
}

async function boot(): Promise<void> {
  if (!window.redCheeks) {
    render()
    return
  }
  connection = await window.redCheeks.getConnection()
  form = { clientId: connection.clientId, clientSecret: '', spreadsheet: connection.spreadsheetId }
  if (connection.signedIn && connection.spreadsheetId) {
    mode = 'overview'
    render()
    await loadOverview(true)
    return
  }
  mode = 'setup'
  render()
}

void boot()
