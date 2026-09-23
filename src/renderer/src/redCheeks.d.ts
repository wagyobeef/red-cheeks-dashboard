/// <reference types="vite/client" />
import type { RedCheeksApi } from '../../preload'

declare global {
  interface Window {
    redCheeks?: RedCheeksApi
  }
}

export {}
