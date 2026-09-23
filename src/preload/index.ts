import { contextBridge, ipcRenderer } from 'electron'
import type { HomeOverview } from '../shared/aggregate'
import type { ConnectionState } from '../shared/connection'

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
  }): Promise<HomeOverview | { status: 'error'; message: string }> => ipcRenderer.invoke('overview:get', input)
}

contextBridge.exposeInMainWorld('redCheeks', api)

export type RedCheeksApi = typeof api
