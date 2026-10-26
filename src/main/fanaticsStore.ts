import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { BidNote, BidPlacement } from '../shared/fanatics'
import { UserFacingError } from './errors'

type Persisted = {
  refreshTokenEncrypted?: string
  notes?: Record<string, { marketPrice?: unknown; placement?: unknown }>
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'fanatics.json')
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

function placement(value: unknown): BidPlacement {
  return value === 'pinned' || value === 'hidden' ? value : 'auto'
}

function marketPrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100) / 100
}

export function readFanaticsNotes(): Record<string, BidNote> {
  const notes = readPersisted().notes ?? {}
  const parsed: Record<string, BidNote> = {}
  for (const [id, note] of Object.entries(notes)) {
    if (!id || typeof note !== 'object' || note === null) continue
    parsed[id] = { marketPrice: marketPrice(note.marketPrice), placement: placement(note.placement) }
  }
  return parsed
}

export function saveFanaticsNote(id: string, note: BidNote): void {
  const data = readPersisted()
  const notes = { ...data.notes }
  if (note.marketPrice === null && note.placement === 'auto') delete notes[id]
  else notes[id] = { marketPrice: note.marketPrice, placement: note.placement }
  data.notes = notes
  writePersisted(data)
}

export function readStoredRefreshToken(): string | null {
  return decrypt(readPersisted().refreshTokenEncrypted)
}

export function saveStoredRefreshToken(token: string): void {
  const data = readPersisted()
  data.refreshTokenEncrypted = encrypt(token)
  writePersisted(data)
}

export function clearStoredRefreshToken(): void {
  const data = readPersisted()
  delete data.refreshTokenEncrypted
  writePersisted(data)
}
