import type { EngineApi } from './api'
import { createFakeApi } from './fakeApi'
import { makeDevices } from './fakeData'
import { tauriApi } from './tauriApi'

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
    /** Development only: the fake engine, so preview scripts can press keys it can't hear. */
    __ringpadFake?: EngineApi
  }
}

export function selectEngineApi(): EngineApi {
  if (window.__TAURI_INTERNALS__) return tauriApi
  const fake = createFakeApi(fakeOptions())
  // StrictMode builds the api twice in development and keeps the first, so the first one wins here too.
  if (import.meta.env.DEV) window.__ringpadFake ??= fake
  return fake
}

/** Development only: /?cable=none starts the fake engine on a PC with no virtual cable. */
function fakeOptions() {
  if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('cable') !== 'none') return undefined
  return { devices: makeDevices().filter((device) => !device.virtualCable) }
}
