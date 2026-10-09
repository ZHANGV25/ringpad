import type { EngineApi } from './api'
import { createFakeApi } from './fakeApi'
import { makeDevices } from './fakeData'
import { tauriApi } from './tauriApi'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function selectEngineApi(): EngineApi {
  return window.__TAURI_INTERNALS__ ? tauriApi : createFakeApi(fakeOptions())
}

/** Development only: /?cable=none starts the fake engine on a PC with no virtual cable. */
function fakeOptions() {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('cable') !== 'none') return undefined
  return { devices: makeDevices().filter((device) => !device.virtualCable) }
}
