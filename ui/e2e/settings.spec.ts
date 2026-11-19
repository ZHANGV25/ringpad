import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mainWindow, openMainWindow } from './app'
import { SETTINGS_TABS, openSettingsTab, type SettingsTab } from './screens'

/** Something only that tab shows. */
const TAB_CONTENT: Record<SettingsTab, (page: Page) => Locator> = {
  Mic: (page) => page.getByRole('button', { name: 'Play a test sound' }),
  Clips: (page) => page.getByRole('button', { name: 'Open clips folder' }),
  Keys: (page) => page.getByText('Mouse side buttons work too.'),
  App: (page) => page.getByRole('button', { name: 'Source on GitHub' }),
}

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Settings sections' })

test.describe('settings', () => {
  test('opens on the Mic tab from the main window', async ({ page }) => {
    await openMainWindow(page)
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(tabs(page).getByRole('tab')).toHaveText([...SETTINGS_TABS])
    await expect(tabs(page).getByRole('tab', { name: 'Mic' })).toHaveAttribute('aria-selected', 'true')
    await expect(TAB_CONTENT.Mic(page)).toBeVisible()
    await expect(mainWindow(page).clipCard).toHaveCount(0)
  })

  for (const tab of SETTINGS_TABS) {
    test(`the ${tab} tab renders only its own section`, async ({ page }) => {
      await openSettingsTab(page, tab)
      await expect(TAB_CONTENT[tab](page)).toBeVisible()
      const others = SETTINGS_TABS.filter((other) => other !== tab)
      for (const other of others) {
        await expect(TAB_CONTENT[other](page)).toHaveCount(0)
      }
    })
  }

  test('Back returns to the main window', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(mainWindow(page).clipCard).toBeVisible()
    await expect(tabs(page)).toHaveCount(0)
  })
})
