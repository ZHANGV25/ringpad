import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { clipWithButton, fillPads, mainWindow, openMainWindow } from './app'
import { blockTalkKeys, emitError, engineSettings, holdKey, pressKey, releaseKey, setStatus, updateEngineSettings } from './fake'
import { inkOn, watchMeter } from './inspect'

// The header and footer sit inside <main>, so they are not banner or contentinfo landmarks.
const topStatus = (page: Page) => page.locator('header.topbar').getByRole('status')
const footer = (page: Page) => page.locator('footer.footer')

test.describe('main window status', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
  })

  test('the top bar says what Ringpad listens to', async ({ page }) => {
    await expect(topStatus(page)).toHaveText('Listening to your headphones')
    await expect(topStatus(page).locator('.status-dot')).toHaveClass(/\bon\b/)
    await expect(topStatus(page).getByRole('button', { name: 'Fix' })).toHaveCount(0)
  })

  test('the top bar shows starting up, and waiting for a closed app, without a Fix', async ({ page }) => {
    await setStatus(page, { kind: 'starting' })
    await expect(topStatus(page)).toHaveText('Starting')
    await setStatus(page, { kind: 'waiting', sourceLabel: 'VALORANT' })
    await expect(topStatus(page)).toHaveText('Waiting for VALORANT to open')
    await expect(topStatus(page).locator('.status-dot')).not.toHaveClass(/\bon\b/)
    await expect(topStatus(page).getByRole('button', { name: 'Fix' })).toHaveCount(0)
  })

  test('with no virtual mic the top bar says so, and Fix opens Settings', async ({ page }) => {
    await setStatus(page, { kind: 'needsSetup', reason: 'No virtual cable found' })
    await expect(topStatus(page)).toContainText('No virtual cable found')
    await topStatus(page).getByRole('button', { name: 'Fix' }).click()
    const tabs = page.getByRole('tablist', { name: 'Settings sections' })
    await expect(tabs.getByRole('tab', { name: 'Mic' })).toHaveAttribute('aria-selected', 'true')
  })

  test('a lost device stops Ringpad, the top bar says which, and Fix opens Settings', async ({ page }) => {
    await setStatus(page, { kind: 'stopped', reason: 'device not found: Microphone' })
    await expect(topStatus(page)).toContainText('device not found: Microphone')
    await topStatus(page).getByRole('button', { name: 'Fix' }).click()
    await expect(page.getByRole('tablist', { name: 'Settings sections' })).toBeVisible()
  })

  test('an engine error shows a notice that goes away on its own', async ({ page }) => {
    await emitError(page, 'Nothing heard in the last 5 s')
    const notice = page.getByRole('alert')
    await expect(notice).toHaveText('Nothing heard in the last 5 s')
    // Notices stay for 4 s.
    await expect(notice).toHaveCount(0, { timeout: 10_000 })
  })
})

test.describe('what your team hears', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
  })

  test('the meter rises while a clip plays to the team', async ({ page }) => {
    const peak = await watchMeter(footer(page).getByRole('meter', { name: 'What your team hears' }))
    expect(await peak()).toBeLessThan(10)
    await clipWithButton(page)
    await mainWindow(page).send.click()
    await expect.poll(peak).toBeGreaterThan(50)
  })

  test('the clip volume slider sets how loud clips are for the team', async ({ page }) => {
    const volume = footer(page).getByRole('slider', { name: 'Clip volume' })
    await expect(volume).toHaveValue('0.5')
    await volume.press('End')
    await expect(footer(page).getByText('100%')).toBeVisible()
    await expect.poll(async () => (await engineSettings(page)).sendVolume).toBe(1)
    await volume.press('Home')
    await expect(footer(page).getByText('0%')).toBeVisible()
    await expect.poll(async () => (await engineSettings(page)).sendVolume).toBe(0)
  })

  test('with a talk key, the footer shows when the mic is on', async ({ page }) => {
    await expect(footer(page).getByText('Mic off')).toHaveCount(0)
    await updateEngineSettings(page, { micMode: 'pushToTalk', hotkeys: { ...(await engineSettings(page)).hotkeys, talk: 't' } })
    await expect(footer(page).getByText('Mic off')).toBeVisible()
    await holdKey(page, 't')
    await expect(footer(page).getByText('Mic on')).toBeVisible()
    await releaseKey(page, 't')
    await expect(footer(page).getByText('Mic off')).toBeVisible()

    await updateEngineSettings(page, { micMode: 'toggle' })
    await pressKey(page, 't')
    await expect(footer(page).getByText('Mic on')).toBeVisible()
    await pressKey(page, 't')
    await expect(footer(page).getByText('Mic off')).toBeVisible()
  })

  test('the footer shows the game keys Ringpad holds while a pad plays', async ({ page }) => {
    await updateEngineSettings(page, { pressTalkKeys: 'clips' })
    await fillPads(page, 1)
    await expect(footer(page).getByText(/^Holding/)).toHaveCount(0)
    await pressKey(page, 'f1')
    await expect(footer(page).getByText('Holding V')).toBeVisible()
    await pressKey(page, 'f9')
    await expect(footer(page).getByText(/^Holding/)).toHaveCount(0)
  })

  test('the footer says why Windows blocked the game key', async ({ page }) => {
    const message = 'Windows blocked VALORANT. Run Ringpad as administrator.'
    await blockTalkKeys(page, message)
    await expect(footer(page).getByRole('alert')).toHaveText(message)
    await blockTalkKeys(page, null)
    await expect(footer(page).getByRole('alert')).toHaveCount(0)
  })
})

test.describe('waveforms', () => {
  test('the tape, the clip and each filled pad draw their waveform', async ({ page }) => {
    await openMainWindow(page)
    await expect.poll(() => inkOn(page.getByRole('img', { name: 'The last 30 seconds of audio' }))).toBeGreaterThan(0.01)
    await fillPads(page, 1)
    await expect.poll(() => inkOn(page.getByRole('img', { name: 'Current clip waveform' }))).toBeGreaterThan(0.01)
    await expect.poll(() => inkOn(page.getByRole('img', { name: 'Pad 1 waveform' }))).toBeGreaterThan(0.01)
  })

  test('the tape and the Clip button follow the clip settings', async ({ page }) => {
    await openMainWindow(page)
    await updateEngineSettings(page, { historySeconds: 60, grabSeconds: 8 })
    await expect(page.getByRole('img', { name: 'The last 60 seconds of audio' })).toBeVisible()
    await expect(page.getByText('Last 60 s')).toBeVisible()
    await expect(mainWindow(page).clipButton).toContainText('8 s')
    await expect.poll(() => inkOn(page.getByRole('img', { name: 'The last 60 seconds of audio' }))).toBeGreaterThan(0.01)
  })
})
