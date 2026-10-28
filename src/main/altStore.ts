import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AltNote, AltPlacement } from '../shared/alt'
import { WATCHING_SAMPLE_LIMIT } from '../shared/alt'
import { UserFacingError } from './errors'

type Persisted = {
  sessionTokenEncrypted?: string
  notes?: Record<string, { marketPrice?: unknown; placement?: unknown }>
  watchingSample?: unknown
}

function filePath(): string {
  return path.join(app.getPath('userData'), 'alt.json')
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

function placement(value: unknown): AltPlacement {
  return value === 'pinned' || value === 'hidden' ? value : 'auto'
}

function marketPrice(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value * 100) / 100
}

export function readAltNotes(): Record<string, AltNote> {
  const notes = readPersisted().notes ?? {}
  const parsed: Record<string, AltNote> = {}
  for (const [id, note] of Object.entries(notes)) {
    if (!id || typeof note !== 'object' || note === null) continue
    parsed[id] = { marketPrice: marketPrice(note.marketPrice), placement: placement(note.placement) }
  }
  return parsed
}

export function saveAltNote(id: string, note: AltNote): void {
  const data = readPersisted()
  const notes = { ...data.notes }
  if (note.marketPrice === null && note.placement === 'auto') delete notes[id]
  else notes[id] = { marketPrice: note.marketPrice, placement: note.placement }
  data.notes = notes
  writePersisted(data)
}

export function readWatchingSample(): string[] {
  const sample = readPersisted().watchingSample
  if (!Array.isArray(sample)) return []
  const ids: string[] = []
  for (const id of sample) {
    if (typeof id !== 'string' || !id || ids.includes(id)) continue
    ids.push(id)
    if (ids.length >= WATCHING_SAMPLE_LIMIT) break
  }
  return ids
}

export function saveWatchingSample(ids: readonly string[]): void {
  const data = readPersisted()
  data.watchingSample = ids.slice(0, WATCHING_SAMPLE_LIMIT)
  writePersisted(data)
}

export function readStoredAltSession(): string | null {
  return decrypt(readPersisted().sessionTokenEncrypted)
}

export function saveStoredAltSession(token: string): void {
  const data = readPersisted()
  data.sessionTokenEncrypted = encrypt(token)
  writePersisted(data)
}

export function clearStoredAltSession(): void {
  const data = readPersisted()
  delete data.sessionTokenEncrypted
  writePersisted(data)
}
