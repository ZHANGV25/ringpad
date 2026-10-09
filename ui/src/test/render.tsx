import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../App'
import { createFakeApi, type FakeEngineApi } from '../engine/fakeApi'
import type { DeviceInfo, Settings } from '../engine/types'

interface Options {
  firstRunDone?: boolean
  settings?: Partial<Settings>
  devices?: DeviceInfo[]
}

/** A fake engine with no timers, so tests decide when anything happens. */
export function makeApi({ firstRunDone = true, settings, devices }: Options = {}): FakeEngineApi {
  return createFakeApi({ firstRunDone, startTimers: false, settings, devices })
}

/** Renders the app and waits until the first snapshot has loaded. */
export async function renderApp(api: FakeEngineApi = makeApi()): Promise<FakeEngineApi> {
  render(<App api={api} />)
  await waitFor(() => {
    if (screen.queryByText('Starting')) throw new Error('still starting')
  })
  return api
}

/** Fills pads through the same calls the UI makes, before the app renders. */
export async function withPads(api: FakeEngineApi, slots: number[]): Promise<FakeEngineApi> {
  await api.grabClip()
  for (const slot of slots) {
    await api.saveClipToPad({ slot })
  }
  await api.stopAll()
  return api
}

export function noCableDevices(): DeviceInfo[] {
  return [
    { id: 'headphones', name: 'Headphones', direction: 'output', isDefault: true, virtualCable: null },
    { id: 'mic', name: 'Microphone', direction: 'input', isDefault: true, virtualCable: null },
  ]
}
