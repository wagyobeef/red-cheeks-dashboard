import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { ConnectionState } from '../shared/connection'
import { UserFacingError } from './errors'

type Persisted = {
  clientId?: string
  clientSecretEncrypted?: string
  spreadsheetId?: string
  refreshTokenEncrypted?: string
}

export type Secrets = {
  clientId: string | null
  clientSecret: string | null
  spreadsheetId: string | null
  refreshToken: string | null
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'connection.json')
}

function readPersisted(): Persisted {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8')) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Persisted
  } catch {
    return {}
  }
}

function writePersisted(data: Persisted): void {
  const target = filePath()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
  fs.chmodSync(target, 0o600)
}

function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new UserFacingError('This computer cannot encrypt saved credentials.')
  }
  return safeStorage.encryptString(value).toString('base64')
}

function decrypt(value: string | undefined): string | null {
  if (!value) return null
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'))
  } catch {
    return null
  }
}

export function getConnectionState(): ConnectionState {
  const data = readPersisted()
  return {
    clientId: data.clientId ?? '',
    hasClientSecret: Boolean(data.clientSecretEncrypted),
    spreadsheetId: data.spreadsheetId ?? '',
    signedIn: Boolean(data.refreshTokenEncrypted)
  }
}

export function getSecrets(): Secrets {
  const data = readPersisted()
  return {
    clientId: data.clientId ?? null,
    clientSecret: decrypt(data.clientSecretEncrypted),
    spreadsheetId: data.spreadsheetId ?? null,
    refreshToken: decrypt(data.refreshTokenEncrypted)
  }
}

export function saveConnection(input: {
  clientId: string
  clientSecret: string
  spreadsheetId: string
}): void {
  const data = readPersisted()
  const clientId = input.clientId.trim()
  if (!clientId) throw new UserFacingError('Enter a Google OAuth client ID.')

  const clientSecret = input.clientSecret.trim()
  if (!clientSecret && !data.clientSecretEncrypted) {
    throw new UserFacingError('Enter a Google OAuth client secret.')
  }

  data.clientId = clientId
  data.spreadsheetId = input.spreadsheetId
  if (clientSecret) data.clientSecretEncrypted = encrypt(clientSecret)
  writePersisted(data)
}

export function saveRefreshToken(refreshToken: string): void {
  const data = readPersisted()
  data.refreshTokenEncrypted = encrypt(refreshToken)
  writePersisted(data)
}

export function clearRefreshToken(): void {
  const data = readPersisted()
  delete data.refreshTokenEncrypted
  writePersisted(data)
}
