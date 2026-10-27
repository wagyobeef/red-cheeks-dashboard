import { pushLoadStep, type LoadStep } from '../../shared/fanatics'
import type { ListedCard, PaymentLabel, PendingSale, SellingSnapshot, ShipmentCard, UnlistedCard } from '../../shared/fanaticsSelling'
import { formatCount, formatUsd } from '../../shared/present'

type Banner = { text: string; tone: 'info' | 'error' }
type Busy = 'load' | 'sign-in' | 'sign-out' | null

let requestRender = (): void => {}
let titleTip: HTMLElement | null = null
let snapshot: SellingSnapshot | null = null
let busy: Busy = null
let banner: Banner | null = null
let steps: LoadStep[] = []
let progressToken = 0

export function bindSelling(render: () => void): void {
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

function days(value: number | null): string {
  return value === null ? '—' : formatCount(value)
}

function cardsLabel(count: number): string {
  return `${formatCount(count)} ${count === 1 ? 'card' : 'cards'}`
}

function paymentLabel(payment: PaymentLabel): string {
  return payment === 'waiting' ? 'Waiting for buyer' : 'In progress'
}

export function sellingPanel(): HTMLElement {
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
  if (snapshot.status === 'ready') {
    if (snapshot.listed.length > 0) stack.append(listedCard(snapshot.listed))
    if (snapshot.pending.length > 0) stack.append(pendingCard(snapshot))
    if (snapshot.shipping.length > 0) stack.append(shippingCard(snapshot.shipping))
    if (snapshot.unlisted.length > 0) stack.append(unlistedCard(snapshot.unlisted))
    if (banner) stack.append(el('p', banner.tone === 'error' ? 'note error' : 'note', banner.text))
  }
  return stack
}

function loadingCard(): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Fanatics Selling'))
  if (shownSteps().length > 0) card.append(stepList())
  return card
}

function shownSteps(): LoadStep[] {
  if (steps.length > 0) return steps
  if (busy === 'sign-out') return [{ id: 'sign-out', label: 'Signing out of Fanatics' }]
  if (busy === 'sign-in') return [{ id: 'open', label: 'Opening Fanatics Collect' }]
  if (busy === 'load') return [{ id: 'load', label: 'Loading your vault' }]
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

function watchProgress(token: number, source: 'sign-in' | 'selling'): () => void {
  if (!window.redCheeks) return () => {}
  const listen = source === 'sign-in' ? window.redCheeks.onFanaticsProgress : window.redCheeks.onFanaticsSellingProgress
  return listen((step) => {
    if (token !== progressToken) return
    steps = pushLoadStep(steps, step)
    requestRender()
  })
}

function signInCard(error: string | null): HTMLElement {
  const card = el('section', 'card')
  card.append(el('h2', undefined, 'Fanatics Selling'))
  card.append(
    el(
      'p',
      'lede',
      'Sign in to Fanatics Collect to see the cards in your vault. The same Fanatics session works for Auctions and Selling.'
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
  header.append(el('h2', undefined, 'Fanatics Selling'))
  const refresh = el('button', 'icon-button')
  refresh.type = 'button'
  refresh.setAttribute('aria-label', 'Refresh')
  refresh.title = 'Refresh'
  refresh.disabled = busy !== null
  refresh.append(refreshIcon())
  refresh.addEventListener('click', () => {
    void loadSelling(true)
  })
  header.append(refresh)
  card.append(header)

  if (!snapshot || snapshot.status === 'empty') {
    card.append(el('p', 'lede', snapshot?.status === 'empty' ? snapshot.message : 'No cards in your Fanatics vault.'))
    card.append(signOutButton())
    return card
  }
  if (snapshot.status !== 'ready') return card

  const metrics = el('div', 'metrics selling-metrics')
  for (const metric of [
    { label: 'Total value', value: formatUsd(snapshot.totalValue) },
    { label: 'Cards', value: formatCount(snapshot.cardCount) },
    { label: 'Pending sales', value: formatUsd(snapshot.pendingSalesTotal) }
  ]) {
    const block = el('div', 'metric')
    block.append(el('p', 'metric-label', metric.label), el('p', 'metric-value', metric.value))
    metrics.append(block)
  }
  card.append(metrics)
  card.append(el('p', 'note', 'Total value adds the purchase price of each vault card.'))
  if (snapshot.listed.length === 0 && snapshot.pending.length === 0 && snapshot.shipping.length === 0 && snapshot.unlisted.length === 0) {
    card.append(el('p', 'lede', 'Nothing is listed, awaiting payment, or being shipped.'))
  }
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

function tableCard(title: string, summary: string, sectionClass: string, headers: string[], rows: HTMLElement[]): HTMLElement {
  const card = el('section', 'card wide')
  card.append(el('h2', undefined, title))
  card.append(el('p', 'note bid-note', summary))
  const list = el('div', 'bid-list')
  const block = el('section', `bid-section ${sectionClass}`)
  const head = el('div', 'bid-row bid-head')
  for (const label of headers) head.append(el('span', undefined, label))
  block.append(head)
  for (const row of rows) block.append(row)
  list.append(block)
  card.append(list)
  return card
}

function listedCard(items: ListedCard[]): HTMLElement {
  return tableCard('Listed cards', `${cardsLabel(items.length)} listed`, 'sell-listed', ['Item', 'Cert', 'Purchase', 'Listing', 'Margin', 'Favorites', 'Days listed', 'Days owned'], items.map(listedRow))
}

function pendingCard(board: Extract<SellingSnapshot, { status: 'ready' }>): HTMLElement {
  const profit = board.pendingProfit === null ? '—' : formatUsd(board.pendingProfit)
  const summary = `${cardsLabel(board.pending.length)} pending sale · ${formatUsd(board.pendingSalesTotal)} · ${profit} profit`
  return tableCard(
    'Pending sales',
    summary,
    'sell-pending',
    ['Item', 'Cert', 'Purchase', 'Sale', 'Profit', 'Sale date', 'Days to sale', 'Payment'],
    board.pending.map(pendingRow)
  )
}

function shippingCard(items: ShipmentCard[]): HTMLElement {
  return tableCard('Pending shipment', `${cardsLabel(items.length)} being shipped`, 'sell-shipping', ['Item'], items.map(shippingRow))
}

function unlistedCard(items: UnlistedCard[]): HTMLElement {
  return tableCard('Unlisted cards', `${cardsLabel(items.length)} unlisted`, 'sell-unlisted', ['Item', 'Purchase', 'Days owned'], items.map(unlistedRow))
}

function itemName(name: string, url: string): HTMLButtonElement {
  const button = el('button', 'bid-name')
  button.type = 'button'
  const title = el('span', 'bid-title', name)
  title.addEventListener('mouseenter', () => showTitleTip(title, name))
  title.addEventListener('mouseleave', hideTitleTip)
  button.append(title)
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    void openCard(url)
  })
  return button
}

function openRow(name: string, url: string, cells: HTMLElement[]): HTMLElement {
  const row = el('div', 'bid-row')
  row.append(itemName(name, url), ...cells)
  row.addEventListener('click', () => {
    void openCard(url)
  })
  return row
}

function listedRow(item: ListedCard): HTMLElement {
  return openRow(item.name, item.url, [
    el('span', 'bid-figure', item.cert ?? '—'),
    el('span', 'bid-figure', money(item.purchasePrice)),
    el('span', 'bid-figure', money(item.listingPrice)),
    el('span', 'bid-figure', money(item.margin)),
    el('span', 'bid-figure', days(item.favorites)),
    el('span', 'bid-figure', days(item.daysListed)),
    el('span', 'bid-figure', days(item.daysOwned))
  ])
}

function pendingRow(item: PendingSale): HTMLElement {
  const payment = el('span', `bid-status is-${item.payment}`, paymentLabel(item.payment))
  return openRow(item.name, item.url, [
    el('span', 'bid-figure', item.cert ?? '—'),
    el('span', 'bid-figure', money(item.purchasePrice)),
    el('span', 'bid-figure', money(item.salePrice)),
    el('span', 'bid-figure', money(item.profit)),
    el('span', 'bid-figure', item.soldOn ?? '—'),
    el('span', 'bid-figure', days(item.daysToSale)),
    payment
  ])
}

function shippingRow(item: ShipmentCard): HTMLElement {
  return openRow(item.name, item.url, [])
}

function unlistedRow(item: UnlistedCard): HTMLElement {
  return openRow(item.name, item.url, [el('span', 'bid-figure', money(item.purchasePrice)), el('span', 'bid-figure', days(item.daysOwned))])
}

async function openCard(url: string): Promise<void> {
  if (!window.redCheeks) return
  const opened = await window.redCheeks.openFanaticsListing(url)
  if (!opened.ok) {
    banner = { text: opened.message, tone: 'error' }
    requestRender()
  }
}

async function signInToFanatics(): Promise<void> {
  if (!window.redCheeks) return
  const token = ++progressToken
  busy = 'sign-in'
  banner = null
  steps = [{ id: 'open', label: 'Opening Fanatics Collect' }]
  const stop = watchProgress(token, 'sign-in')
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
  await loadSelling(true)
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

export async function loadSelling(refresh: boolean): Promise<void> {
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
  const stop = watchProgress(token, 'selling')
  requestRender()
  const result = await window.redCheeks.getFanaticsSelling({ refresh })
  stop()
  if (token !== progressToken) return
  snapshot = result
  busy = null
  steps = []
  requestRender()
}
