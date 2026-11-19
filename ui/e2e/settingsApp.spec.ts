import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mainWindow } from './app'
import { engineSettings, openedUrl } from './fake'
import { goToSettingsTab, openSettingsTab } from './screens'

const theme = (page: Page) => page.getByRole('tablist', { name: 'Theme' })
const startWithWindows = (page: Page) => page.getByRole('switch', { name: /^Start with Windows/ })
const startInTray = (page: Page) => page.getByRole('switch', { name: /^Start in the tray/ })

/** How light the window's background is, from 0 (black) to 1 (white). */
async function backgroundLightness(page: Page): Promise<number> {
  return page.evaluate(() => {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) throw new Error('No 2D canvas')
    // The canvas turns any CSS colour (rgb(), color(srgb ...)) into plain RGB.
    probe.fillStyle = getComputedStyle(document.body).backgroundColor
    probe.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0] = probe.getImageData(0, 0, 1, 1).data
    return (r + g + b) / (3 * 255)
  })
}

test.describe('settings: App', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingsTab(page, 'App')
  })

  test('Light and Dark switch the theme, and System follows Windows', async ({ page }) => {
    const root = page.locator('html')
    await theme(page).getByRole('tab', { name: 'Dark' }).click()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await expect.poll(() => backgroundLightness(page)).toBeLessThan(0.3)
    await expect.poll(async () => (await engineSettings(page)).theme).toBe('dark')

    await theme(page).getByRole('tab', { name: 'Light' }).click()
    await expect(root).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => backgroundLightness(page)).toBeGreaterThan(0.7)
    await expect.poll(async () => (await engineSettings(page)).theme).toBe('light')

    await theme(page).getByRole('tab', { name: 'System' }).click()
    await expect(root).not.toHaveAttribute('data-theme')
    await expect.poll(async () => (await engineSettings(page)).theme).toBe('system')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => backgroundLightness(page)).toBeLessThan(0.3)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => backgroundLightness(page)).toBeGreaterThan(0.7)
  })

  test('Start with Windows and Start in the tray', async ({ page }) => {
    await expect(startWithWindows(page)).not.toBeChecked()
    await expect(startInTray(page)).not.toBeChecked()
    await startWithWindows(page).click()
    await startInTray(page).click()
    await expect.poll(async () => {
      const settings = await engineSettings(page)
      return [settings.startWithWindows, settings.startMinimized]
    }).toEqual([true, true])

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(mainWindow(page).clipCard).toBeVisible()
    await goToSettingsTab(page, 'App')
    await expect(startWithWindows(page)).toBeChecked()
    await expect(startInTray(page)).toBeChecked()
    await startInTray(page).click()
    await expect.poll(async () => (await engineSettings(page)).startMinimized).toBe(false)
  })

  test('Source on GitHub opens the repository over https', async ({ page }) => {
    await page.getByRole('button', { name: 'Source on GitHub' }).click()
    await expect.poll(() => openedUrl(page)).toBe('https://github.com/ZHANGV25/ringpad')
  })

  test('the VB-CABLE credit opens VB-Audio’s site over https', async ({ page }) => {
    await page.getByRole('button', { name: 'www.vb-cable.com' }).click()
    await expect.poll(() => openedUrl(page)).toBe('https://vb-audio.com/Cable/')
  })

  test('says which version this is and what it does with your audio', async ({ page }) => {
    await expect(page.getByText('Version 0.1.0 · fake · MIT license')).toBeVisible()
    await expect(page.getByText('Private by design.')).toBeVisible()
    await expect(page.getByRole('img', { name: "Ringpad's panda" })).toBeVisible()
  })
})
