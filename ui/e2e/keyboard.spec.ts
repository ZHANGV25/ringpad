import { expect, test } from './fixtures'
import { clipWithButton, fillPads, mainWindow, openMainWindow, openPadSheet, padKey } from './app'
import { engineSettings } from './fake'
import { walkWithTab } from './focus'
import { MORE_SCREENS, SCREENS, openSettingsTab } from './screens'

test.describe('every control can be reached with Tab and shows a focus ring', () => {
  for (const screen of [...SCREENS, ...MORE_SCREENS]) {
    test(screen.name, async ({ page }) => {
      await screen.open(page)
      const walk = await walkWithTab(page)
      expect(walk.missed, 'controls Tab never reached').toEqual([])
      const hidden = walk.stops.filter((stop) => stop.problems.length > 0).map((stop) => `${stop.name}: ${stop.problems.join('; ')}`)
      expect(hidden, 'focus rings that do not show').toEqual([])
    })
  }
})

test.describe('keyboard', () => {
  test('Escape closes the pad options sheet', async ({ page }) => {
    await openMainWindow(page)
    await fillPads(page, 1)
    const sheet = await openPadSheet(page, 0)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(mainWindow(page).pads.getByRole('button', { name: 'Play Pad 1' })).toBeVisible()
  })

  test('Escape closes the save clip sheet without saving', async ({ page }) => {
    const main = mainWindow(page)
    await openMainWindow(page)
    await clipWithButton(page)
    await main.save.click()
    const sheet = page.getByRole('dialog', { name: 'Save clip to a pad' })
    await expect(sheet).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect(main.pads.getByRole('button', { name: 'Save the clip to pad 1' })).toBeVisible()
  })

  test('a pad plays from the keyboard with Enter', async ({ page }) => {
    await openMainWindow(page)
    await fillPads(page, 1)
    await mainWindow(page).pads.getByRole('button', { name: 'Play Pad 1' }).focus()
    await page.keyboard.press('Enter')
    await expect(padKey(page, 0)).toHaveClass(/\bplaying\b/)
  })

  test('arrow keys move between settings tabs', async ({ page }) => {
    await openSettingsTab(page, 'Mic')
    const tabs = page.getByRole('tablist', { name: 'Settings sections' })
    await tabs.getByRole('tab', { name: 'Mic' }).focus()
    await page.keyboard.press('ArrowRight')
    const clips = tabs.getByRole('tab', { name: 'Clips' })
    await expect(clips).toHaveAttribute('aria-selected', 'true')
    // Focus moves with the choice, so the ring is on the tab that is open.
    await expect(clips).toBeFocused()
    await expect(page.getByRole('button', { name: 'Open clips folder' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await expect(tabs.getByRole('tab', { name: 'App' })).toHaveAttribute('aria-selected', 'true')
    await expect(tabs.getByRole('tab', { name: 'App' })).toBeFocused()
  })

  test('arrow keys change a choice such as the theme', async ({ page }) => {
    await openSettingsTab(page, 'App')
    const theme = page.getByRole('tablist', { name: 'Theme' })
    await theme.getByRole('tab', { name: 'System' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(theme.getByRole('tab', { name: 'Light' })).toHaveAttribute('aria-selected', 'true')
    await expect(theme.getByRole('tab', { name: 'Light' })).toBeFocused()
    await expect.poll(async () => (await engineSettings(page)).theme).toBe('light')
  })
})
