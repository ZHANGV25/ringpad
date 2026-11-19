import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mainWindow } from './app'
import { clipsFolderOpened, engineSettings, setAudioApps, updateEngineSettings } from './fake'
import { goToSettingsTab, openSettingsTab } from './screens'

const recordFrom = (page: Page) => page.getByRole('combobox', { name: 'Record from' })
const relay = (page: Page) => page.getByRole('switch', { name: /^Play it in my headphones/ })
/** A slider row's value as shown, such as "5 s" or "80%". */
const shown = (page: Page, slider: string) => page.locator('.slider-row').filter({ has: page.getByRole('slider', { name: slider, exact: true }) }).locator('.numeric')

async function backAndReturn(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(mainWindow(page).clipCard).toBeVisible()
  await goToSettingsTab(page, 'Clips')
}

test.describe('settings: Clips', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingsTab(page, 'Clips')
  })

  test('Record from: everything, one app, or one output device', async ({ page }) => {
    await expect(recordFrom(page)).toHaveValue('default')
    await recordFrom(page).selectOption('app:Discord.exe')
    await expect.poll(async () => (await engineSettings(page)).source).toEqual({ kind: 'app', exe: 'Discord.exe', name: 'Discord' })
    await expect(relay(page)).toHaveCount(0)

    await recordFrom(page).selectOption('device:speakers')
    await expect.poll(async () => (await engineSettings(page)).source).toEqual({ kind: 'device', id: 'speakers' })
    await expect(relay(page)).toBeVisible()

    await recordFrom(page).selectOption('default')
    await expect.poll(async () => (await engineSettings(page)).source).toEqual({ kind: 'default' })
    await backAndReturn(page)
    await expect(recordFrom(page)).toHaveValue('default')
  })

  test('the app list marks the app playing sound now, and lists virtual cables nowhere', async ({ page }) => {
    await expect(recordFrom(page).locator('option', { hasText: '● Discord' })).toHaveCount(1)
    const devices = recordFrom(page).locator('optgroup[label="An output device"] option')
    await expect(devices).toHaveText(['Headphones', 'Speakers'])
  })

  test('Play it in my headphones relays a recorded output device', async ({ page }) => {
    await updateEngineSettings(page, { source: { kind: 'device', id: 'speakers' } })
    await expect(relay(page)).not.toBeChecked()
    await relay(page).click()
    await expect(relay(page)).toBeChecked()
    await expect.poll(async () => (await engineSettings(page)).relaySource).toBe(true)
    await relay(page).click()
    await expect.poll(async () => (await engineSettings(page)).relaySource).toBe(false)
  })

  test('Refresh apps lists an app that started since', async ({ page }) => {
    const overwatch = recordFrom(page).locator('option', { hasText: 'Overwatch' })
    await expect(overwatch).toHaveCount(0)
    await setAudioApps(page, [
      { pid: 4024, exe: 'Discord.exe', name: 'Discord', active: true, peak: 0.5 },
      { pid: 5150, exe: 'Overwatch.exe', name: 'Overwatch', active: false, peak: 0 },
    ])
    await page.getByRole('button', { name: 'Refresh apps' }).click()
    await expect(overwatch).toHaveCount(1)
    await recordFrom(page).selectOption('app:Overwatch.exe')
    await expect.poll(async () => (await engineSettings(page)).source).toEqual({ kind: 'app', exe: 'Overwatch.exe', name: 'Overwatch' })
  })

  test('a saved app that is closed stays listed as not running', async ({ page }) => {
    await updateEngineSettings(page, { source: { kind: 'app', exe: 'Overwatch.exe', name: 'Overwatch' } })
    await expect(recordFrom(page)).toHaveValue('app:Overwatch.exe')
    await expect(recordFrom(page).locator('option', { hasText: 'Overwatch (not running)' })).toHaveCount(1)
  })

  test('Each clip sets how much the Clip button grabs', async ({ page }) => {
    const each = page.getByRole('slider', { name: 'Each clip' })
    await expect(shown(page, 'Each clip')).toHaveText('5 s')
    await each.press('ArrowRight')
    await expect(shown(page, 'Each clip')).toHaveText('6 s')
    await expect.poll(async () => (await engineSettings(page)).grabSeconds).toBe(6)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(mainWindow(page).clipButton).toContainText('6 s')
  })

  test('Keep the last sets how much the tape holds', async ({ page }) => {
    const keep = page.getByRole('slider', { name: 'Keep the last' })
    await keep.press('ArrowRight')
    await expect(shown(page, 'Keep the last')).toHaveText('35 s')
    await keep.press('End')
    await expect(shown(page, 'Keep the last')).toHaveText('120 s')
    await expect.poll(async () => (await engineSettings(page)).historySeconds).toBe(120)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByText('Last 120 s')).toBeVisible()
  })

  test('clip volume for the team and for you', async ({ page }) => {
    await page.getByRole('slider', { name: 'Your team', exact: true }).press('Home')
    await page.getByRole('slider', { name: 'You', exact: true }).press('End')
    await expect(shown(page, 'Your team')).toHaveText('0%')
    await expect(shown(page, 'You')).toHaveText('100%')
    await expect.poll(async () => {
      const settings = await engineSettings(page)
      return [settings.sendVolume, settings.monitorVolume]
    }).toEqual([0, 1])
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('slider', { name: 'Clip volume' })).toHaveValue('0')
  })

  test('Plays in picks the headphones clips play in', async ({ page }) => {
    const headphones = page.getByRole('combobox', { name: 'Headphones' })
    await expect(headphones.locator('option')).toHaveText(['Same as Windows', 'Headphones', 'Speakers'])
    await headphones.selectOption('speakers')
    await expect.poll(async () => (await engineSettings(page)).headphones).toBe('speakers')
    await headphones.selectOption('')
    await expect.poll(async () => (await engineSettings(page)).headphones).toBeNull()
  })

  test('Keep clips for sets how long saved clips stay', async ({ page }) => {
    const keep = page.getByRole('combobox', { name: 'Keep clips for' })
    await expect(keep).toHaveValue('7')
    await keep.selectOption({ label: '30 days' })
    await expect.poll(async () => (await engineSettings(page)).clipRetentionDays).toBe(30)
    await keep.selectOption({ label: 'Forever' })
    await expect.poll(async () => (await engineSettings(page)).clipRetentionDays).toBe(0)
    await backAndReturn(page)
    await expect(keep).toHaveValue('0')
  })

  test('Open clips folder opens it', async ({ page }) => {
    await page.getByRole('button', { name: 'Open clips folder' }).click()
    await expect.poll(() => clipsFolderOpened(page)).toBe(true)
  })
})
