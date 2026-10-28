import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { UserFacingError, logSafe } from './errors'

export type ChromeCookie = {
  name: string
  value: string
  expires?: number
}

export type SignedInSite = {
  id: string
  host: string
  domain: string
}

export const fanaticsChromeSite: SignedInSite = {
  id: 'fanatics',
  host: 'https://www.fanaticscollect.com',
  domain: '.fanaticscollect.com'
}

type ChromeRuntime = {
  tail: Promise<void>
  debugPort: number | null
  reuseBlankTab: boolean
}

const runtimes = new Map<string, ChromeRuntime>()

function runtimeFor(site: SignedInSite): ChromeRuntime {
  const existing = runtimes.get(site.id)
  if (existing) return existing
  const created: ChromeRuntime = { tail: Promise.resolve(), debugPort: null, reuseBlankTab: false }
  runtimes.set(site.id, created)
  return created
}

function enqueue(site: SignedInSite, task: () => Promise<void>): Promise<void> {
  const runtime = runtimeFor(site)
  const run = runtime.tail.then(task, task)
  runtime.tail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function profileDir(site: SignedInSite): string {
  const name = site.id === 'fanatics' ? 'fanatics-chrome' : `${site.id}-chrome`
  return path.join(app.getPath('userData'), name)
}

function portFile(site: SignedInSite): string {
  const name = site.id === 'fanatics' ? 'fanatics-chrome.port' : `${site.id}-chrome.port`
  return path.join(app.getPath('userData'), name)
}

function chromeBinary(): string | null {
  const home = app.getPath('home')
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function readPort(site: SignedInSite): number | null {
  try {
    const port = Number(fs.readFileSync(portFile(site), 'utf8').trim())
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
  } catch {
    return null
  }
}

function writePort(site: SignedInSite, port: number): void {
  const file = portFile(site)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, String(port), { encoding: 'utf8', mode: 0o600 })
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

async function isDebuggableChrome(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(400) })
    if (!response.ok) return false
    const body = (await response.json()) as { Browser?: unknown }
    return typeof body.Browser === 'string' && body.Browser.startsWith('Chrome/')
  } catch {
    return false
  }
}

async function waitForChrome(port: number): Promise<boolean> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (await isDebuggableChrome(port)) return true
    await delay(200)
  }
  return false
}

async function ensureChrome(site: SignedInSite): Promise<number> {
  const runtime = runtimeFor(site)
  const saved = runtime.debugPort ?? readPort(site)
  if (saved !== null && (await isDebuggableChrome(saved))) {
    runtime.debugPort = saved
    return saved
  }

  const binary = chromeBinary()
  if (!binary) throw new UserFacingError('Google Chrome is needed to open this listing.')
  const port = await freePort()
  fs.mkdirSync(profileDir(site), { recursive: true })
  const child = spawn(
    binary,
    [
      `--user-data-dir=${profileDir(site)}`,
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      'about:blank'
    ],
    { detached: true, stdio: 'ignore' }
  )
  child.unref()
  if (!(await waitForChrome(port))) throw new UserFacingError('Google Chrome could not be opened.')
  runtime.debugPort = port
  runtime.reuseBlankTab = true
  writePort(site, port)
  return port
}

type CdpMessage = { id?: number; result?: Record<string, unknown>; error?: { message?: string } }

let nextCommand = 0

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('Chrome did not accept a connection.'))
    }, 5_000)
    socket.addEventListener('open', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('Chrome did not accept a connection.'))
    })
  })
}

function command(socket: WebSocket, method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = ++nextCommand
  const result = new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      reject(new Error('Chrome did not finish opening the listing.'))
    }, 8_000)
    const onMessage = (event: MessageEvent): void => {
      let message: CdpMessage
      try {
        message = JSON.parse(String(event.data)) as CdpMessage
      } catch {
        return
      }
      if (message.id !== id) return
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (message.error) reject(new Error(message.error.message ?? 'Chrome could not open the listing.'))
      else resolve(message.result ?? {})
    }
    socket.addEventListener('message', onMessage)
  })
  socket.send(JSON.stringify({ id, method, params }))
  return result
}

async function listingSocket(site: SignedInSite, port: number): Promise<string> {
  const runtime = runtimeFor(site)
  if (runtime.reuseBlankTab) {
    runtime.reuseBlankTab = false
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) })
    const pages = (await response.json()) as { type?: string; url?: string; webSocketDebuggerUrl?: string }[]
    const blank = pages.find((page) => page.type === 'page' && page.url === 'about:blank' && page.webSocketDebuggerUrl)
    if (blank?.webSocketDebuggerUrl) return blank.webSocketDebuggerUrl
  }

  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {
    method: 'PUT',
    signal: AbortSignal.timeout(2_000)
  })
  if (!created.ok) throw new Error('Chrome could not open a tab.')
  const page = (await created.json()) as { webSocketDebuggerUrl?: string }
  if (!page.webSocketDebuggerUrl) throw new Error('Chrome could not open a tab.')
  return page.webSocketDebuggerUrl
}

async function showListing(site: SignedInSite, port: number, url: string, cookies: ChromeCookie[]): Promise<void> {
  const socket = await connect(await listingSocket(site, port))
  try {
    for (const cookie of cookies) {
      const set = await command(socket, 'Network.setCookie', {
        name: cookie.name,
        value: cookie.value,
        url: site.host,
        domain: site.domain,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
        ...(cookie.expires ? { expires: cookie.expires } : {})
      })
      if (set.success === false) throw new Error('Chrome did not keep the saved session.')
    }
    await command(socket, 'Page.enable')
    await command(socket, 'Page.navigate', { url })
    await command(socket, 'Page.bringToFront')
  } finally {
    socket.close()
  }
}

async function openNow(site: SignedInSite, url: string, cookies: ChromeCookie[]): Promise<void> {
  try {
    await showListing(site, await ensureChrome(site), url, cookies)
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    logSafe(error)
    throw new UserFacingError('That listing could not be opened in Chrome.')
  }
}

async function closeNow(site: SignedInSite): Promise<void> {
  const runtime = runtimeFor(site)
  const port = runtime.debugPort ?? readPort(site)
  runtime.debugPort = null
  runtime.reuseBlankTab = false
  if (port !== null && (await isDebuggableChrome(port))) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1_000) })
      const body = (await response.json()) as { webSocketDebuggerUrl?: string }
      if (body.webSocketDebuggerUrl) {
        const socket = await connect(body.webSocketDebuggerUrl)
        try {
          await command(socket, 'Browser.close')
        } finally {
          socket.close()
        }
      }
    } catch (error) {
      logSafe(error)
    }
    const deadline = Date.now() + 3_000
    while (Date.now() < deadline && (await isDebuggableChrome(port))) await delay(200)
  }
  try {
    fs.rmSync(portFile(site), { force: true })
    fs.rmSync(profileDir(site), { recursive: true, force: true })
  } catch (error) {
    logSafe(error)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function openSignedInChrome(
  url: string,
  cookies: ChromeCookie[],
  site: SignedInSite = fanaticsChromeSite
): Promise<void> {
  return enqueue(site, () => openNow(site, url, cookies))
}

export function closeSignedInChrome(site: SignedInSite = fanaticsChromeSite): Promise<void> {
  return enqueue(site, () => closeNow(site))
}
