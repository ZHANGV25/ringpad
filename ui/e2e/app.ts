import type { Locator, Page, Request } from '@playwright/test'
import { REFUSED, expect } from './fixtures'
import { pressKey, updateEngineSettings } from './fake'

/** How many times openApp loads the app before it gives up on the dev server. */
const MAX_LOADS = 3

/**
 * `query` is the dev query string, such as `?cable=none` for a PC with no virtual cable. If the dev
 * server refused part of the load, part of the app is missing, so it loads the app again.
 */
export async function openApp(page: Page, query = ''): Promise<void> {
  for (let attempt = 1; attempt <= MAX_LOADS; attempt += 1) {
    if (!(await loadWasRefused(page, `/${query}`))) break
  }
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
}

/** Loads `url`; true when the dev server refused a connection on the way. */
async function loadWasRefused(page: Page, url: string): Promise<boolean> {
  let refused = false
  const onFailed = (request: Request) => {
    if (request.failure()?.errorText === REFUSED) refused = true
  }
  page.on('requestfailed', onFailed)
  try {
    // goto waits for the load event, and every module of the app loads before it (main.tsx
    // imports them all statically), so by then each request has either loaded or failed.
    await page.goto(url)
  } catch (error) {
    if (!String(error).includes(REFUSED)) throw error
    // Chrome shows its error page just after; a load started before that would be cut short by it.
    await page.waitForURL((at) => at.protocol === 'chrome-error:', { waitUntil: 'commit' })
    refused = true
  } finally {
    page.off('requestfailed', onFailed)
  }
  return refused
}

/** Opens Ringpad as a returning user does: setup is already done, so it lands on the main window. */
export async function openMainWindow(page: Page): Promise<void> {
  await openApp(page)
  await updateEngineSettings(page, { firstRunDone: true })
  await expect(mainWindow(page).clipCard).toBeVisible()
}

/**
 * Presses the Clip hotkey (F8). Hotkeys are global and handled by the engine, not the page, so
 * the browser build has no F8 listener; the fake engine hears the key the way the real one would.
 */
export async function pressClipHotkey(page: Page): Promise<void> {
  await pressKey(page, 'f8')
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

/** Clips, then saves the clip into the first `count` pads by clicking each empty one. */
export async function fillPads(page: Page, count: number): Promise<void> {
  const main = mainWindow(page)
  await clipWithButton(page)
  for (let slot = 0; slot < count; slot += 1) {
    await main.pads.getByRole('button', { name: `Save the clip to pad ${slot + 1}` }).click()
    await expect(main.pads.getByRole('button', { name: `Play Pad ${slot + 1}` })).toBeVisible()
  }
}

/**
 * Opens a filled pad's options sheet. Right-click works at every window size; the options button
 * (`name` is the pad's name) only shows on a pad tall enough for it.
 */
export async function openPadSheet(page: Page, slot: number, how: 'right-click' | 'options button' = 'right-click', name = `Pad ${slot + 1}`): Promise<Locator> {
  if (how === 'right-click') await padKey(page, slot).click({ button: 'right' })
  else await mainWindow(page).pads.getByRole('button', { name: `${name} options` }).click()
  const sheet = page.getByRole('dialog', { name: `Pad ${slot + 1}` })
  await expect(sheet).toBeVisible()
  return sheet
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
