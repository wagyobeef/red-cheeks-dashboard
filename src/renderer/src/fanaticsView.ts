import {
  formatMarketComparison,
  parseMarketPrice,
  pushLoadStep,
  type BidPlacement,
  type FanaticsItem,
  type FanaticsSnapshot,
  type LoadStep
} from '../../shared/fanatics'
import { formatCount, formatUsd } from '../../shared/present'

type Banner = { text: string; tone: 'info' | 'error' }
type Busy = 'load' | 'sign-in' | 'sign-out' | null

let requestRender = (): void => {}
let titleTip: HTMLElement | null = null
let snapshot: FanaticsSnapshot | null = null
let busy: Busy = null
let banner: Banner | null = null
let steps: LoadStep[] = []
let progressToken = 0

export function bindFanatics(render: () => void): void {
  requestRender = render
}

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

function showTitleTip(anchor: HTMLElement, text: string): void {
  if (!titleTip) {
    titleTip = el('div', 'bid-tooltip')
    titleTip.setAttribute('role', 'tooltip')
    document.body.append(titleTip)
  }
  titleTip.textContent = text
  titleTip.hidden = false
  const rect = anchor.getBoundingClientRect()
  titleTip.style.left = `${Math.max(8, rect.left)}px`
  titleTip.style.top = `${rect.bottom + 6}px`
  const box = titleTip.getBoundingClientRect()
  if (box.right > window.innerWidth - 8) titleTip.style.left = `${Math.max(8, window.innerWidth - box.width - 8)}px`
  if (box.bottom > window.innerHeight - 8) titleTip.style.top = `${Math.max(8, rect.top - box.height - 6)}px`
}

function hideTitleTip(): void {
  if (titleTip) titleTip.hidden = true
}

function money(value: number | null): string {
  return value === null ? '—' : formatUsd(value)
}

function statusLabel(status: FanaticsItem['status']): string {
  return status === 'winning' ? 'Winning' : 'Outbid'
}

function extensionLabel(extension: NonNullable<FanaticsItem['extension']>): string {
  return extension === 'next-window' ? 'Next window' : 'Needs bid'
}

export function fanaticsPanel(): HTMLElement {
  hideTitleTip()
  const stack = el('div', 'stack')
  if (busy === 'load' || busy === 'sign-out') {
    stack.append(loadingCard())
    return stack
  }
  if (!snapshot) {
    stack.append(loadingCard())
    return stack
  }

  if (snapshot.status === 'signed-out' || snapshot.status === 'error') {
    stack.append(signInCard(snapshot.status === 'error' ? snapshot.message : null))
    return stack
  }

  stack.append(overviewCard())
  if (snapshot.status === 'ready') stack.append(listCard())
  return stack
}

function loadingCard(): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Fanatics Auctions'))
  if (shownSteps().length > 0) card.append(stepList())
  return card
}

function shownSteps(): LoadStep[] {
  if (steps.length > 0) return steps
  if (busy === 'sign-out') return [{ id: 'sign-out', label: 'Signing out of Fanatics' }]
  if (busy === 'sign-in') return [{ id: 'open', label: 'Opening Fanatics Collect' }]
  if (busy === 'load') return [{ id: 'load', label: 'Loading your bids' }]
  return []
}

function stepList(): HTMLElement {
  const list = el('ol', 'load-steps')
  list.setAttribute('aria-live', 'polite')
  const visible = shownSteps()
  visible.forEach((step, index) => {
    const current = index === visible.length - 1
    const item = el('li', current ? 'is-current' : 'is-done', step.label)
    if (current) item.setAttribute('aria-current', 'step')
    list.append(item)
  })
  return list
}

function watchProgress(token: number): () => void {
  if (!window.redCheeks) return () => {}
  return window.redCheeks.onFanaticsProgress((step) => {
    if (token !== progressToken) return
    steps = pushLoadStep(steps, step)
    requestRender()
  })
}

function signInCard(error: string | null): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Fanatics Auctions'))
  card.append(
    el(
      'p',
      'lede',
      'Sign in to Fanatics Collect to see your weekly auction bids. Red Cheeks opens Fanatics so you can sign in there, then keeps the session on this Mac.'
    )
  )
  const signIn = el('button', 'primary', 'Sign in to Fanatics Collect')
  signIn.type = 'button'
  signIn.disabled = busy !== null
  signIn.addEventListener('click', () => {
    void signInToFanatics()
  })
  card.append(signIn)
  if (busy === 'sign-in') card.append(stepList())
  if (error) card.append(el('p', 'note error', error))
  if (banner) card.append(el('p', banner.tone === 'error' ? 'note error' : 'note', banner.text))
  return card
}

function overviewCard(): HTMLElement {
  const card = el('section', 'card')
  const header = el('div', 'card-header')
  header.append(el('h2', undefined, 'Fanatics Auctions'))
  const refresh = el('button', 'icon-button')
  refresh.type = 'button'
  refresh.setAttribute('aria-label', 'Refresh')
  refresh.title = 'Refresh'
  refresh.disabled = busy !== null
  refresh.append(refreshIcon())
  refresh.addEventListener('click', () => {
    void loadFanatics(true)
  })
  header.append(refresh)
  card.append(header)

  if (!snapshot || snapshot.status === 'empty') {
    card.append(el('p', 'lede', snapshot?.status === 'empty' ? snapshot.message : 'No active bids in the current weekly auction.'))
    card.append(signOutButton())
    return card
  }
  if (snapshot.status !== 'ready') return card

  if (snapshot.auctionName) card.append(el('p', 'eyebrow auction-name', snapshot.auctionName))
  const metrics = el('div', 'metrics fanatics-metrics')
  for (const metric of [
    { label: 'Winning', value: formatCount(snapshot.winningCount) },
    { label: 'Outbid', value: formatCount(snapshot.outbidCount) },
    { label: 'Winning bids', value: formatUsd(snapshot.winningCurrentTotal) },
    { label: 'Winning max bids', value: formatUsd(snapshot.winningMaxTotal) }
  ]) {
    const block = el('div', 'metric')
    block.append(el('p', 'metric-label', metric.label), el('p', 'metric-value', metric.value))
    metrics.append(block)
  }
  card.append(metrics)
  card.append(el('p', 'note', "Totals include the 20% buyer's premium."))
  card.append(signOutButton())
  return card
}

function signOutButton(): HTMLButtonElement {
  const button = el('button', 'fanatics-sign-out', 'Sign out of Fanatics')
  button.type = 'button'
  button.disabled = busy !== null
  button.addEventListener('click', () => {
    void signOut()
  })
  return button
}

function listCard(): HTMLElement {
  const card = el('section', 'card wide')
  card.append(el('h2', undefined, 'Bids'))
  card.append(el('p', 'note bid-note', "Current and max bids include the 20% buyer's premium."))
  if (!snapshot || snapshot.status === 'empty') {
    card.append(el('p', 'lede', snapshot?.status === 'empty' ? snapshot.message : 'No active bids in the current weekly auction.'))
    return card
  }
  if (snapshot.status !== 'ready') return card

  const list = el('div', 'bid-list')
  for (const section of snapshot.sections) {
    const block = el('section', 'bid-section')
    block.append(el('h3', undefined, section.title))
    const head = el('div', 'bid-row bid-head')
    for (const label of ['Item', 'Actions', 'Current bid', 'Max bid', 'Market price', 'Profit']) head.append(el('span', undefined, label))
    block.append(head)
    for (const item of section.items) block.append(bidRow(item))
    list.append(block)
  }
  card.append(list)
  if (banner) card.append(el('p', banner.tone === 'error' ? 'note error' : 'note', banner.text))
  return card
}

function bidRow(item: FanaticsItem): HTMLElement {
  const row = el('div', 'bid-row')
  const name = el('button', 'bid-name')
  name.type = 'button'
  name.append(el('span', `bid-status is-${item.status}`, statusLabel(item.status)))
  if (item.closed) name.append(el('span', 'bid-status is-ended', 'Ended'))
  if (item.extension) {
    const extension = el('span', `bid-status is-${item.extension}`, extensionLabel(item.extension))
    extension.title = item.extension === 'next-window' ? 'Extended to the next window' : 'A bid is needed to extend this item'
    name.append(extension)
  }
  const title = el('span', 'bid-title', item.name)
  title.addEventListener('mouseenter', () => showTitleTip(title, item.name))
  title.addEventListener('mouseleave', hideTitleTip)
  name.append(title)
  name.addEventListener('click', (event) => {
    event.stopPropagation()
    void openListing(item.url)
  })
  row.addEventListener('click', () => {
    void openListing(item.url)
  })

  const current = el('div', 'bid-money')
  current.append(el('span', 'bid-figure', money(item.currentBid)))
  const max = el('div', 'bid-money')
  max.append(el('span', 'bid-figure', money(item.maxBid)))

  const market = el('label', 'bid-market')
  const input = el('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.placeholder = 'Market'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', `Market price for ${item.name}`)
  if (item.marketPrice !== null) input.value = String(item.marketPrice)
  const compare = el('p', 'bid-compare')
  const paint = () => {
    const parsed = parseMarketPrice(input.value)
    compare.textContent = parsed.ok && parsed.value !== null ? formatMarketComparison(item.currentBid, item.maxBid, parsed.value) : ''
  }
  paint()
  input.addEventListener('input', paint)
  market.addEventListener('click', (event) => event.stopPropagation())
  const marketPrice = (): number | null => {
    const parsed = parseMarketPrice(input.value)
    return parsed.ok ? parsed.value : item.marketPrice
  }
  input.addEventListener('blur', () => {
    const parsed = parseMarketPrice(input.value)
    if (!parsed.ok) {
      input.value = item.marketPrice === null ? '' : String(item.marketPrice)
      paint()
      return
    }
    if (parsed.value === item.marketPrice) return
    void applyNote(item, { marketPrice: parsed.value, placement: item.placement })
  })
  market.append(input)

  const actions = el('div', 'bid-actions')
  actions.append(
    actionButton(item.placement === 'pinned' ? 'Unpin' : 'Pin', () => {
      void applyNote(item, { marketPrice: marketPrice(), placement: item.placement === 'pinned' ? 'auto' : 'pinned' })
    }),
    actionButton(item.placement === 'hidden' ? 'Unhide' : 'Hide', () => {
      void applyNote(item, { marketPrice: marketPrice(), placement: item.placement === 'hidden' ? 'auto' : 'hidden' })
    })
  )

  row.append(name, actions, current, max, market, compare)
  return row
}

function actionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = el('button', 'bid-action', label)
  button.type = 'button'
  button.disabled = busy !== null
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })
  return button
}

async function openListing(url: string): Promise<void> {
  if (!window.redCheeks) return
  const opened = await window.redCheeks.openFanaticsListing(url)
  if (!opened.ok) {
    banner = { text: opened.message, tone: 'error' }
    requestRender()
  }
}

async function applyNote(item: FanaticsItem, note: { marketPrice: number | null; placement: BidPlacement }): Promise<void> {
  if (!window.redCheeks) return
  const result = await window.redCheeks.updateFanaticsItem({ id: item.id, ...note })
  snapshot = result
  banner = result.status === 'error' ? { text: result.message, tone: 'error' } : null
  requestRender()
}

async function signInToFanatics(): Promise<void> {
  if (!window.redCheeks) return
  const token = ++progressToken
  busy = 'sign-in'
  banner = null
  steps = [{ id: 'open', label: 'Opening Fanatics Collect' }]
  const stop = watchProgress(token)
  requestRender()
  const signedIn = await window.redCheeks.signInToFanatics()
  stop()
  if (token !== progressToken) return
  if (!signedIn.ok) {
    busy = null
    steps = []
    snapshot = { status: 'signed-out' }
    banner = { text: signedIn.message, tone: 'error' }
    requestRender()
    return
  }
  await loadFanatics(true)
}

async function signOut(): Promise<void> {
  if (!window.redCheeks) return
  progressToken += 1
  busy = 'sign-out'
  steps = [{ id: 'sign-out', label: 'Signing out of Fanatics' }]
  requestRender()
  const signedOut = await window.redCheeks.signOutOfFanatics()
  busy = null
  steps = []
  snapshot = { status: 'signed-out' }
  banner = signedOut.ok ? null : { text: signedOut.message, tone: 'error' }
  requestRender()
}

export async function loadFanatics(refresh: boolean): Promise<void> {
  if (!window.redCheeks) {
    snapshot = { status: 'error', message: 'Open the Red Cheeks app to read Fanatics Collect.' }
    requestRender()
    return
  }
  const token = ++progressToken
  banner = null
  steps = []
  const session = await window.redCheeks.getFanaticsSession()
  if (token !== progressToken) return
  if (!session.signedIn) {
    busy = null
    snapshot = { status: 'signed-out' }
    requestRender()
    return
  }
  busy = 'load'
  const stop = watchProgress(token)
  requestRender()
  const result = await window.redCheeks.getFanaticsBoard({ refresh })
  stop()
  if (token !== progressToken) return
  snapshot = result
  busy = null
  steps = []
  requestRender()
}
