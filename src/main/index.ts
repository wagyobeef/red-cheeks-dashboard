import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { homeOverviewForSheet } from '../shared/aggregate'
import { parseSpreadsheetId } from '../shared/spreadsheetId'
import { UserFacingError, logSafe } from './errors'
import { getAccessToken, readOverallValues, signIn } from './google'
import { clearRefreshToken, getConnectionState, getSecrets, saveConnection } from './store'

const dirname = path.dirname(fileURLToPath(import.meta.url))
let sheetCache: { spreadsheetId: string; rows: unknown[][] } | null = null

function clearSheetCache(): void {
  sheetCache = null
}

function requestedYear(input: unknown): number | null {
  if (typeof input !== 'object' || input === null || !('year' in input)) return null
  const year = input.year
  return typeof year === 'number' && Number.isInteger(year) ? year : null
}

function requestedMonthlyYear(input: unknown): number | null {
  if (typeof input !== 'object' || input === null || !('monthlyYear' in input)) return null
  const year = input.monthlyYear
  return typeof year === 'number' && Number.isInteger(year) ? year : null
}

function requestedRefresh(input: unknown): boolean {
  if (typeof input !== 'object' || input === null || !('refresh' in input)) return true
  return input.refresh !== false
}
const smokeRun = process.env.RED_CHEEKS_SMOKE === '1'

if (smokeRun) {
  app.setPath('userData', path.join(app.getPath('temp'), 'red-cheeks-dashboard-smoke'))
}

function userMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message
  logSafe(error)
  return fallback
}

function registerIpc(): void {
  ipcMain.handle('connection:get', () => getConnectionState())

  ipcMain.handle('connection:save', (_event, input: unknown) => {
    try {
      const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
      const clientId = typeof record.clientId === 'string' ? record.clientId : ''
      const clientSecret = typeof record.clientSecret === 'string' ? record.clientSecret : ''
      const spreadsheetId = parseSpreadsheetId(typeof record.spreadsheet === 'string' ? record.spreadsheet : '')
      if (!clientId.trim()) throw new UserFacingError('Enter a Google OAuth client ID.')
      if (!clientSecret.trim() && !getConnectionState().hasClientSecret) {
        throw new UserFacingError('Enter a Google OAuth client secret.')
      }
      if (!spreadsheetId) throw new UserFacingError('Enter a Google Sheets URL or spreadsheet ID.')
      saveConnection({ clientId, clientSecret, spreadsheetId })
      clearSheetCache()
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, message: userMessage(error, 'The connection could not be saved.') }
    }
  })

  ipcMain.handle('connection:sign-in', async () => {
    try {
      await signIn()
      return { ok: true as const }
    } catch (error) {
      return { ok: false as const, message: userMessage(error, 'Google sign-in failed.') }
    }
  })

  ipcMain.handle('connection:sign-out', () => {
    clearRefreshToken()
    clearSheetCache()
    return { ok: true as const }
  })

  ipcMain.handle('overview:get', async (_event, input: unknown) => {
    try {
      const secrets = getSecrets()
      if (!secrets.spreadsheetId) {
        throw new UserFacingError('Add a spreadsheet before reading the sheet.')
      }
      const refresh = requestedRefresh(input)
      if (refresh || !sheetCache || sheetCache.spreadsheetId !== secrets.spreadsheetId) {
        let accessToken: string
        try {
          accessToken = await getAccessToken()
        } catch (error) {
          if (error instanceof UserFacingError && error.message === 'Sign in again to read the spreadsheet.') {
            clearRefreshToken()
            clearSheetCache()
          }
          throw error
        }
        sheetCache = {
          spreadsheetId: secrets.spreadsheetId,
          rows: await readOverallValues(accessToken, secrets.spreadsheetId)
        }
      }
      const today = new Date().getFullYear()
      return homeOverviewForSheet(sheetCache.rows, requestedYear(input), requestedMonthlyYear(input), today)
    } catch (error) {
      return { status: 'error' as const, message: userMessage(error, 'The spreadsheet could not be read.') }
    }
  })
}

async function waitForText(win: BrowserWindow, expected: string): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < 5_000) {
    const text = await win.webContents.executeJavaScript('document.body.innerText')
    if (typeof text === 'string' && text.includes(expected)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return false
}

async function runSmoke(win: BrowserWindow): Promise<void> {
  const ready = await waitForText(win, 'Connect your spreadsheet')
  const bridge = await win.webContents.executeJavaScript('typeof window.redCheeks?.getYearlyOverview')
  const checks = [ready, bridge === 'function']

  await win.webContents.executeJavaScript(`
    document.querySelector('#client-id').value = ''
    document.querySelector('#client-secret').value = 'desktop-secret'
    document.querySelector('#spreadsheet').value = 'https://docs.google.com/spreadsheets/d/abc123_XYZ-long/edit'
    document.querySelector('form button[type="button"]').click()
  `)
  checks.push(await waitForText(win, 'Enter a Google OAuth client ID.'))

  await win.webContents.executeJavaScript(`
    document.querySelector('#client-id').value = 'desktop-client'
    document.querySelector('#client-secret').value = 'desktop-secret'
    document.querySelector('#spreadsheet').value = 'not a url'
    document.querySelector('form button[type="button"]').click()
  `)
  checks.push(await waitForText(win, 'Enter a Google Sheets URL or spreadsheet ID.'))

  await win.webContents.executeJavaScript(`
    document.querySelector('#client-id').value = 'desktop-client'
    document.querySelector('#client-secret').value = 'desktop-secret'
    document.querySelector('#spreadsheet').value = 'https://docs.google.com/spreadsheets/d/abc123_XYZ-long/edit'
    document.querySelector('form button[type="button"]').click()
  `)
  checks.push(await waitForText(win, 'Saved.'))

  const text = await win.webContents.executeJavaScript('document.body.innerText')
  console.log(text)
  console.log(`bridge:${bridge}`)
  app.exit(checks.every(Boolean) ? 0 : 1)
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    show: false,
    title: 'Red Cheeks',
    backgroundColor: '#f3eee6',
    webPreferences: {
      preload: path.join(dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (smokeRun) {
    win.webContents.once('did-finish-load', () => {
      void runSmoke(win)
    })
  } else {
    win.once('ready-to-show', () => win.show())
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(path.join(dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
