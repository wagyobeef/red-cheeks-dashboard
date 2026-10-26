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

const LISTING_HOST = 'https://www.fanaticscollect.com'

let tail: Promise<void> = Promise.resolve()
let debugPort: number | null = null
let reuseBlankTab = false

function enqueue(task: () => Promise<void>): Promise<void> {
  const run = tail.then(task, task)
  tail = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function profileDir(): string {
  return path.join(app.getPath('userData'), 'fanatics-chrome')
}

function portFile(): string {
  return path.join(app.getPath('userData'), 'fanatics-chrome.port')
}

function chromeBinary(): string | null {
  const home = app.getPath('home')
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    path.join(home, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

function readPort(): number | null {
  try {
    const port = Number(fs.readFileSync(portFile(), 'utf8').trim())
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
  } catch {
    return null
  }
}

function writePort(port: number): void {
  fs.mkdirSync(path.dirname(portFile()), { recursive: true })
  fs.writeFileSync(portFile(), String(port), { encoding: 'utf8', mode: 0o600 })
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

async function isFanaticsChrome(port: number): Promise<boolean> {
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
    if (await isFanaticsChrome(port)) return true
    await delay(200)
  }
  return false
}

async function ensureChrome(): Promise<number> {
  const saved = debugPort ?? readPort()
  if (saved !== null && (await isFanaticsChrome(saved))) {
    debugPort = saved
    return saved
  }

  const binary = chromeBinary()
  if (!binary) throw new UserFacingError('Google Chrome is needed to open this listing.')
  const port = await freePort()
  fs.mkdirSync(profileDir(), { recursive: true })
  const child = spawn(
    binary,
    [
      `--user-data-dir=${profileDir()}`,
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
  debugPort = port
  reuseBlankTab = true
  writePort(port)
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

async function listingSocket(port: number): Promise<string> {
  if (reuseBlankTab) {
    reuseBlankTab = false
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

async function showListing(port: number, url: string, cookies: ChromeCookie[]): Promise<void> {
  const socket = await connect(await listingSocket(port))
  try {
    for (const cookie of cookies) {
      const set = await command(socket, 'Network.setCookie', {
        name: cookie.name,
        value: cookie.value,
        url: LISTING_HOST,
        domain: '.fanaticscollect.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax',
        ...(cookie.expires ? { expires: cookie.expires } : {})
      })
      if (set.success === false) throw new Error('Chrome did not keep the Fanatics session.')
    }
    await command(socket, 'Page.enable')
    await command(socket, 'Page.navigate', { url })
    await command(socket, 'Page.bringToFront')
  } finally {
    socket.close()
  }
}

async function openNow(url: string, cookies: ChromeCookie[]): Promise<void> {
  try {
    await showListing(await ensureChrome(), url, cookies)
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    logSafe(error)
    throw new UserFacingError('That listing could not be opened in Chrome.')
  }
}

async function closeNow(): Promise<void> {
  const port = debugPort ?? readPort()
  debugPort = null
  reuseBlankTab = false
  if (port !== null && (await isFanaticsChrome(port))) {
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
    while (Date.now() < deadline && (await isFanaticsChrome(port))) await delay(200)
  }
  try {
    fs.rmSync(portFile(), { force: true })
    fs.rmSync(profileDir(), { recursive: true, force: true })
  } catch (error) {
    logSafe(error)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function openSignedInChrome(url: string, cookies: ChromeCookie[]): Promise<void> {
  return enqueue(() => openNow(url, cookies))
}

export function closeSignedInChrome(): Promise<void> {
  return enqueue(() => closeNow())
}
