import { expect, test } from './fixtures'
import { clipWithButton, fillPads, mainWindow, openMainWindow, padKey } from './app'
import { enginePads, pressKey } from './fake'

/**
 * Hotkeys are global: the engine hears them through Raw Input even while a game has focus, so the
 * tests press them through the fake engine rather than the page.
 */
test.describe('main window hotkeys', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
  })

  test('F1 to F4 each play their pad', async ({ page }) => {
    await fillPads(page, 4)
    for (const slot of [0, 1, 2, 3]) {
      await pressKey(page, `f${slot + 1}`)
      await expect(padKey(page, slot)).toHaveClass(/\bplaying\b/)
      for (const other of [0, 1, 2, 3].filter((item) => item !== slot)) {
        await expect(padKey(page, other)).not.toHaveClass(/\bplaying\b/)
      }
    }
  })

  test('F9 stops a playing pad', async ({ page }) => {
    await fillPads(page, 1)
    await pressKey(page, 'f1')
    await expect(padKey(page, 0)).toHaveClass(/\bplaying\b/)
    await pressKey(page, 'f9')
    await expect(padKey(page, 0)).not.toHaveClass(/\bplaying\b/)
  })

  test('F7 sends the clip, F9 stops it, and the second send key (mouse 5) sends it too', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await pressKey(page, 'f7')
    await expect(main.clipCard.getByText('on air')).toBeVisible()
    await pressKey(page, 'f9')
    await expect(main.clipCard.getByText('your team')).toBeVisible()
    await pressKey(page, 'mouse5')
    await expect(main.clipCard.getByText('on air')).toBeVisible()
  })

  test('F6 then a pad key saves the clip into that pad', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await pressKey(page, 'f6')
    const armed = main.clipCard.getByRole('status')
    await expect(armed).toContainText('Press a pad key to save this clip')
    await pressKey(page, 'f3')
    await expect(main.pads.getByRole('button', { name: 'Play Pad 3' })).toBeVisible()
    await expect(armed).toHaveCount(0)
    // Saving does not play the pad.
    await expect(padKey(page, 2)).not.toHaveClass(/\bplaying\b/)
  })

  test('pressing F6 again stops waiting for a pad key', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await pressKey(page, 'f6')
    await expect(main.clipCard.getByRole('status')).toBeVisible()
    await pressKey(page, 'f6')
    await expect(main.clipCard.getByRole('status')).toHaveCount(0)
  })

  test('Cancel under the clip stops waiting for a pad key', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await pressKey(page, 'f6')
    const armed = main.clipCard.getByRole('status')
    await armed.getByRole('button', { name: 'Cancel' }).click()
    await expect(armed).toHaveCount(0)
    // F1 now plays pad 1, which is empty, instead of saving into it.
    await pressKey(page, 'f1')
    await expect(page.getByRole('alert')).toHaveText('Pad is empty')
    expect((await enginePads(page))[0]).toBeNull()
  })

  test('a hotkey that cannot run says why', async ({ page }) => {
    await pressKey(page, 'f7')
    await expect(page.getByRole('alert')).toHaveText('No clip yet')
  })
})
