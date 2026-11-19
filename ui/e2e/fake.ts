import type { JSHandle, Page } from '@playwright/test'
import type { FileDropEvent } from '../src/engine/api'
import type { FakeEngineApi } from '../src/engine/fakeApi'
import type { AudioApp, CableInstall, DeviceInfo, EngineStatus, Meters, MicUser, PadInfo, Settings, SettingsPatch } from '../src/engine/types'

type FakeWindow = Window & { __ringpadFake?: FakeEngineApi }

/**
 * The dev build's fake engine (window.__ringpadFake, engine/select.ts). Tests reach it for what a
 * page cannot do on its own: global hotkeys (the engine hears them through Raw Input, not the page),
 * Windows events such as a device going away, and checking what a command did.
 */
export async function fakeEngine(page: Page): Promise<JSHandle<FakeEngineApi>> {
  return page.evaluateHandle(() => {
    const fake = (window as FakeWindow).__ringpadFake
    if (!fake) throw new Error('window.__ringpadFake is missing; is this the dev server?')
    return fake
  })
}

/** Presses and releases a global key, such as `f8` or `mouse5` (keys.ts names). */
export async function pressKey(page: Page, key: string): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, name) => fake.simulateKey(name), key)
}

export async function holdKey(page: Page, key: string): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, name) => fake.simulateKeyDown(name), key)
}

export async function releaseKey(page: Page, key: string): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, name) => fake.simulateKeyUp(name), key)
}

export async function engineSettings(page: Page): Promise<Settings> {
  return (await fakeEngine(page)).evaluate(async (fake) => (await fake.getSnapshot()).settings)
}

export async function updateEngineSettings(page: Page, patch: SettingsPatch): Promise<void> {
  await (await fakeEngine(page)).evaluate(async (fake, changes) => {
    await fake.updateSettings({ patch: changes })
  }, patch)
}

export async function enginePads(page: Page): Promise<Array<PadInfo | null>> {
  return (await fakeEngine(page)).evaluate(async (fake) => (await fake.getSnapshot()).pads)
}

export async function engineDevices(page: Page): Promise<DeviceInfo[]> {
  return (await fakeEngine(page)).evaluate(async (fake) => (await fake.getSnapshot()).devices)
}

/** Windows' device list changes to `devices`; `silent` keeps the UI from hearing until it asks. */
export async function setDevices(page: Page, devices: DeviceInfo[], silent = false): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, change) => fake.simulateDevices(change.devices, { silent: change.silent }), { devices, silent })
}

export async function setAudioApps(page: Page, apps: AudioApp[]): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, list) => fake.setAudioApps(list), apps)
}

/** From now on these apps record from a mic, and nothing else changes on its own. */
export async function setMicUsers(page: Page, users: MicUser[]): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, list) => fake.setMicUsers(list), users)
}

export async function setStatus(page: Page, status: EngineStatus): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, next) => fake.simulateStatus(next), status)
}

export async function emitError(page: Page, message: string): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, text) => fake.emitError(text), message)
}

export async function setMeters(page: Page, meters: Meters): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, next) => fake.simulateMeters(next), meters)
}

/** Windows refuses Ringpad's game key presses with this sentence; null clears it. */
export async function blockTalkKeys(page: Page, message: string | null): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, text) => fake.simulateTalkBlocked(text), message)
}

export async function dropFiles(page: Page, event: FileDropEvent): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, next) => fake.emitFileDrop(next), event)
}

/** How the next VB-CABLE install ends; `{ error }` makes it fail with that message. */
export async function setNextCableInstall(page: Page, outcome: CableInstall | { error: string }): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, next) => {
    fake.nextCableInstall = typeof next === 'string' ? next : new Error(next.error)
  }, outcome)
}

/** The file the next file picker returns; null closes it without one. */
export async function setNextPickedFile(page: Page, path: string | null): Promise<void> {
  await (await fakeEngine(page)).evaluate((fake, next) => {
    fake.nextPickedFile = next
  }, path)
}

export async function openedUrl(page: Page): Promise<string | null> {
  return (await fakeEngine(page)).evaluate((fake) => fake.openedUrl)
}

export async function clipsFolderOpened(page: Page): Promise<boolean> {
  return (await fakeEngine(page)).evaluate((fake) => fake.clipsFolderOpened)
}

export async function capturingKeys(page: Page): Promise<boolean> {
  return (await fakeEngine(page)).evaluate((fake) => fake.isCapturingKeys())
}
