import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'

/** The parts of the dev build's fake engine (window.__ringpadFake, engine/select.ts) the tests drive. */
interface FakeEngine {
  updateSettings(input: { patch: { firstRunDone: boolean } }): Promise<unknown>
  grabClip(): Promise<unknown>
}

type FakeWindow = Window & { __ringpadFake?: FakeEngine }

/** `query` is the dev query string, such as `?cable=none` for a PC with no virtual cable. */
export async function openApp(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`)
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
}

/** Opens Ringpad as a returning user does: setup is already done, so it lands on the main window. */
export async function openMainWindow(page: Page): Promise<void> {
  await openApp(page)
  await page.evaluate(async () => {
    const fake = (window as FakeWindow).__ringpadFake
    if (!fake) throw new Error('window.__ringpadFake is missing; is this the dev server?')
    await fake.updateSettings({ patch: { firstRunDone: true } })
  })
  await expect(mainWindow(page).clipCard).toBeVisible()
}

/**
 * What the Clip hotkey (F8) does. Hotkeys are global and handled by the engine, not the page, so
 * the browser build has no F8 listener; the fake engine grabs the clip the way the real one would.
 */
export async function pressClipHotkey(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const fake = (window as FakeWindow).__ringpadFake
    if (!fake) throw new Error('window.__ringpadFake is missing; is this the dev server?')
    await fake.grabClip()
  })
}

export interface MainWindow {
  clipCard: Locator
  clipButton: Locator
  preview: Locator
  send: Locator
  stop: Locator
  save: Locator
  pads: Locator
}

export function mainWindow(page: Page): MainWindow {
  const clipCard = page.getByRole('region', { name: 'Current clip' })
  const action = (name: string) => clipCard.getByRole('button', { name, exact: true })
  return {
    clipCard,
    clipButton: page.getByRole('button', { name: /^Clip \d+ s/ }),
    preview: action('Preview'),
    send: action('Send'),
    stop: action('Stop'),
    save: action('Save'),
    pads: page.getByRole('region', { name: 'Pads' }),
  }
}

/** Clips with the Clip button and waits for the short preview every new clip plays to end. */
export async function clipWithButton(page: Page): Promise<void> {
  const main = mainWindow(page)
  await main.clipButton.click()
  await expect(main.clipCard.getByRole('img', { name: 'Current clip waveform' })).toBeVisible()
  await expect(main.preview).toBeVisible()
}

/** The pad's whole key; it carries the `playing` class while the pad plays. */
export function padKey(page: Page, slot: number): Locator {
  return page.locator(`[data-slot="${slot}"]`)
}

/**
 * Waits until nothing is fading or changing colour, so a contrast check never samples a half-faded
 * frame. Endless loops (the live dot, the tape's glide) are left running: they only move things.
 */
export async function settleFades(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const changesLook = (animation: Animation) => {
      const effect = animation.effect
      if (!(effect instanceof KeyframeEffect)) return false
      const keys = effect.getKeyframes().flatMap((frame) => Object.keys(frame))
      return keys.some((key) => key === 'opacity' || /color|background|filter/i.test(key))
    }
    return document
      .getAnimations()
      .filter((animation) => animation.playState === 'running')
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      .every((animation) => !changesLook(animation))
  })
}
