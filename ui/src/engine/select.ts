import type { EngineApi } from './api'
import { createFakeApi } from './fakeApi'
import { tauriApi } from './tauriApi'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function selectEngineApi(): EngineApi {
  return window.__TAURI_INTERNALS__ ? tauriApi : createFakeApi()
}
