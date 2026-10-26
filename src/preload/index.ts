import { contextBridge, ipcRenderer } from 'electron'
import type { HomeOverview } from '../shared/aggregate'
import type { ConnectionState } from '../shared/connection'
import type { BidPlacement, FanaticsSnapshot, LoadStep } from '../shared/fanatics'

export type ActionResult = { ok: true } | { ok: false; message: string }

const api = {
  getConnection: (): Promise<ConnectionState> => ipcRenderer.invoke('connection:get'),
  saveConnection: (input: { clientId: string; clientSecret: string; spreadsheet: string }): Promise<ActionResult> =>
    ipcRenderer.invoke('connection:save', input),
  signIn: (): Promise<ActionResult> => ipcRenderer.invoke('connection:sign-in'),
  signOut: (): Promise<ActionResult> => ipcRenderer.invoke('connection:sign-out'),
  getYearlyOverview: (input: {
    year: number | 'all' | null
    monthlyYear: number | null
    refresh: boolean
  }): Promise<HomeOverview | { status: 'error'; message: string }> => ipcRenderer.invoke('overview:get', input),
  getFanaticsSession: (): Promise<{ signedIn: boolean }> => ipcRenderer.invoke('fanatics:session'),
  getFanaticsBoard: (input: { refresh: boolean }): Promise<FanaticsSnapshot> => ipcRenderer.invoke('fanatics:board', input),
  signInToFanatics: (): Promise<ActionResult> => ipcRenderer.invoke('fanatics:sign-in'),
  signOutOfFanatics: (): Promise<ActionResult> => ipcRenderer.invoke('fanatics:sign-out'),
  updateFanaticsItem: (input: {
    id: string
    marketPrice: number | null
    placement: BidPlacement
  }): Promise<FanaticsSnapshot> => ipcRenderer.invoke('fanatics:update', input),
  openFanaticsListing: (url: string): Promise<ActionResult> => ipcRenderer.invoke('fanatics:open', url),
  onFanaticsProgress: (listener: (step: LoadStep) => void): (() => void) => {
    const handler = (_event: unknown, payload: unknown): void => {
      if (typeof payload !== 'object' || payload === null) return
      const record = payload as { id?: unknown; label?: unknown }
      if (typeof record.id !== 'string' || typeof record.label !== 'string' || !record.id || !record.label) return
      listener({ id: record.id, label: record.label })
    }
    ipcRenderer.on('fanatics:progress', handler)
    return () => ipcRenderer.removeListener('fanatics:progress', handler)
  }
}

contextBridge.exposeInMainWorld('redCheeks', api)

export type RedCheeksApi = typeof api
