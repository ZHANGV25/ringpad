import { expect, test } from './fixtures'
import { mainWindow, openApp, pressClipHotkey } from './app'
import { startSetup } from './screens'

const heading = (name: string) => ({ level: 1, name })

test.describe('first-run setup', () => {
  test('title screen says what Ringpad does and starts setup', async ({ page }) => {
    await openApp(page)
    await expect(page.getByRole('heading', heading('Ringpad'))).toBeVisible()
    await expect(page.getByText('Clip what you just heard. Play it to your team.')).toBeVisible()
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('heading', heading('Use Ringpad’s mic'))).toBeVisible()
  })

  test('Back on the first step returns to the title screen', async ({ page }) => {
    await startSetup(page)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  test('with a cable: pick the mic, try the keys, land on the main window', async ({ page }) => {
    await startSetup(page)
    await expect(page.getByRole('tab', { name: 'Discord' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('status').filter({ hasText: 'Waiting for Discord' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()

    // The fake engine has Discord pick Ringpad's mic a few seconds after setup first looks.
    await expect(page.getByRole('status').filter({ hasText: 'Discord can hear Ringpad' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByRole('heading', heading('Your keys'))).toBeVisible()
    await expect(page.getByText('Grabs the last 5 seconds.')).toBeVisible()
    await pressClipHotkey(page)
    await expect(page.getByText('✓ Got it. You heard it back.')).toBeVisible()
    await expect(page.getByText('Now press F7.')).toBeVisible()

    await page.getByRole('button', { name: 'Done' }).click()
    const main = mainWindow(page)
    await expect(main.clipCard).toBeVisible()
    await expect(main.pads).toBeVisible()
  })

  test('no cable: offers VB-CABLE, installs it, then picks the mic', async ({ page }) => {
    await startSetup(page, '?cable=none')
    await expect(page.getByRole('heading', heading('Add the mic'))).toBeVisible()
    const install = page.getByRole('button', { name: 'Install VB-CABLE' })
    await expect(install).toBeEnabled()
    await expect(page.getByText('Windows will ask. Click Yes.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()

    await install.click()
    await expect(page.getByText('Installed', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByRole('heading', heading('Use Ringpad’s mic'))).toBeVisible()
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page.getByRole('heading', heading('Your keys'))).toBeVisible()
    await page.getByRole('button', { name: 'Done' }).click()
    await expect(mainWindow(page).clipCard).toBeVisible()
  })

  test('no cable: skipping the install skips picking the mic', async ({ page }) => {
    await startSetup(page, '?cable=none')
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(page.getByRole('heading', heading('Your keys'))).toBeVisible()
  })
})
