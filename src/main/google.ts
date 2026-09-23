import { shell } from 'electron'
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library'
import http from 'node:http'
import crypto from 'node:crypto'
import { SPREADSHEETS_READONLY_SCOPE } from '../shared/scope'
import { readMonthCell } from '../shared/month'
import { buildSheetTitlesUrl, buildValuesBatchUrl } from '../shared/sheetsUrl'
import { UserFacingError, googleErrorCode, logSafe } from './errors'
import { getSecrets, saveRefreshToken } from './store'

const MUTATING_SCOPES = new Set([
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata'
])

let signInPromise: Promise<void> | null = null

function signInFailure(error: unknown): UserFacingError {
  const code = googleErrorCode(error)
  if (code === 'invalid_client') {
    return new UserFacingError('Google did not accept that OAuth client. Check the client ID and secret.')
  }
  if (code === 'redirect_uri_mismatch') {
    return new UserFacingError('Google rejected the sign-in redirect. Use a Desktop app OAuth client.')
  }
  if (code === 'access_denied') return new UserFacingError('Google sign-in was canceled.')
  if (error instanceof UserFacingError) return error
  logSafe(error)
  return new UserFacingError('Google sign-in failed.')
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new UserFacingError('Sign-in could not start a local callback.'))
        return
      }
      resolve(address.port)
    })
  })
}

function waitForCode(server: http.Server, redirectUri: string, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error: Error | null, code?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      server.close()
      if (error) reject(error)
      else if (code) resolve(code)
      else reject(new UserFacingError('Google did not return a sign-in code.'))
    }

    const timer = setTimeout(() => {
      finish(new UserFacingError('Google sign-in timed out.'))
    }, 120_000)

    server.on('request', (request, response) => {
      const requestUrl = new URL(request.url ?? '/', redirectUri)
      const hasResult = requestUrl.searchParams.has('code') || requestUrl.searchParams.has('error')
      if (!hasResult) {
        response.writeHead(404)
        response.end()
        return
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Red Cheeks</title></head><body><p>You can close this window and return to Red Cheeks.</p></body></html>'
      )

      if (requestUrl.searchParams.get('state') !== expectedState) {
        finish(new UserFacingError('Google sign-in could not be verified. Try again.'))
        return
      }

      const oauthError = requestUrl.searchParams.get('error')
      if (oauthError === 'access_denied') {
        finish(new UserFacingError('Google sign-in was canceled.'))
        return
      }
      if (oauthError) {
        finish(new UserFacingError('Google sign-in failed.'))
        return
      }

      finish(null, requestUrl.searchParams.get('code') ?? undefined)
    })
  })
}

async function assertReadOnlyAccess(client: OAuth2Client, accessToken: string): Promise<void> {
  const info = await client.getTokenInfo(accessToken)
  const scopes = info.scopes ?? []
  if (!scopes.includes(SPREADSHEETS_READONLY_SCOPE)) {
    throw new UserFacingError('Google did not grant read-only spreadsheet access.')
  }
  if (scopes.some((scope) => MUTATING_SCOPES.has(scope))) {
    throw new UserFacingError('Google granted access that can change files. Sign-in was discarded.')
  }
}

async function runSignIn(): Promise<void> {
  const secrets = getSecrets()
  if (!secrets.clientId || !secrets.clientSecret) {
    throw new UserFacingError('Enter a Google OAuth client before signing in.')
  }

  const server = http.createServer()
  try {
    const port = await listen(server)
    const redirectUri = `http://127.0.0.1:${port}`
    const client = new OAuth2Client({
      clientId: secrets.clientId,
      clientSecret: secrets.clientSecret,
      redirectUri
    })
    const verifier = await client.generateCodeVerifierAsync()
    if (!verifier.codeChallenge) throw new UserFacingError('Google sign-in could not be started.')
    const state = crypto.randomBytes(24).toString('hex')
    const authUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: [SPREADSHEETS_READONLY_SCOPE],
      prompt: 'consent',
      include_granted_scopes: false,
      state,
      code_challenge_method: CodeChallengeMethod.S256,
      code_challenge: verifier.codeChallenge
    })

    if (!authUrl.startsWith('https://accounts.google.com/')) {
      throw new UserFacingError('Google sign-in could not be started.')
    }

    await shell.openExternal(authUrl)
    const code = await waitForCode(server, redirectUri, state)
    const { tokens } = await client.getToken({ code, codeVerifier: verifier.codeVerifier })
    if (!tokens.access_token) throw new UserFacingError('Google did not return an access token.')
    await assertReadOnlyAccess(client, tokens.access_token)

    if (tokens.refresh_token) {
      saveRefreshToken(tokens.refresh_token)
      return
    }
    if (!secrets.refreshToken) {
      throw new UserFacingError('Google did not grant offline access. Sign in again and allow access.')
    }
  } catch (error) {
    throw signInFailure(error)
  } finally {
    server.close()
  }
}

export function signIn(): Promise<void> {
  if (signInPromise) return Promise.reject(new UserFacingError('Sign-in is already in progress.'))
  signInPromise = runSignIn().finally(() => {
    signInPromise = null
  })
  return signInPromise
}

export async function getAccessToken(): Promise<string> {
  const secrets = getSecrets()
  if (!secrets.clientId || !secrets.clientSecret || !secrets.refreshToken) {
    throw new UserFacingError('Sign in again to read the spreadsheet.')
  }

  const client = new OAuth2Client({
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret
  })
  client.setCredentials({ refresh_token: secrets.refreshToken })

  try {
    const response = await client.getAccessToken()
    if (!response.token) throw new UserFacingError('Sign in again to read the spreadsheet.')
    return response.token
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    logSafe(error)
    if (googleErrorCode(error) === 'invalid_grant') {
      throw new UserFacingError('Sign in again to read the spreadsheet.')
    }
    throw new UserFacingError('The spreadsheet could not be read.')
  }
}

function sheetsStatusMessage(status: number): string {
  if (status === 401) return 'Sign in again to read the spreadsheet.'
  if (status === 403) return 'This Google account cannot read that spreadsheet.'
  if (status === 404) return 'That spreadsheet was not found.'
  if (status === 400) return 'The spreadsheet could not be read.'
  return 'The spreadsheet could not be read.'
}

export type WorkbookValues = {
  overall: unknown[][] | null
  allMonths: unknown[][] | null
  monthSheets: { title: string; rows: unknown[][] }[]
}

function sheetRows(values: unknown): unknown[][] {
  if (!Array.isArray(values)) return []
  return values.filter((row): row is unknown[] => Array.isArray(row))
}

export async function readWorkbook(accessToken: string, spreadsheetId: string): Promise<WorkbookValues> {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const metadata = await fetch(buildSheetTitlesUrl(spreadsheetId), {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(20_000)
  })
  if (!metadata.ok) throw new UserFacingError(sheetsStatusMessage(metadata.status))

  const listed = (await metadata.json()) as { sheets?: { properties?: { title?: unknown } }[] }
  const titles = (listed.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((title): title is string => typeof title === 'string' && title !== '')
  const monthTitles = titles.filter((title) => readMonthCell(title) !== null)
  const ranges = [
    ...(titles.includes('Overall') ? ['Overall'] : []),
    ...(titles.includes('AllMonths') ? ['AllMonths'] : []),
    ...monthTitles
  ]
  if (ranges.length === 0) return { overall: null, allMonths: null, monthSheets: [] }

  const values = await fetch(buildValuesBatchUrl(spreadsheetId, ranges), {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(20_000)
  })
  if (!values.ok) throw new UserFacingError(sheetsStatusMessage(values.status))

  const body = (await values.json()) as { valueRanges?: { values?: unknown }[] }
  const byTitle = new Map<string, unknown[][]>()
  ranges.forEach((title, index) => {
    byTitle.set(title, sheetRows(body.valueRanges?.[index]?.values))
  })

  return {
    overall: titles.includes('Overall') ? (byTitle.get('Overall') ?? []) : null,
    allMonths: titles.includes('AllMonths') ? (byTitle.get('AllMonths') ?? []) : null,
    monthSheets: monthTitles.map((title) => ({ title, rows: byTitle.get(title) ?? [] }))
  }
}
