import { expect, test } from './fixtures'
import { clipWithButton, mainWindow, openMainWindow, padKey, pressClipHotkey } from './app'

test.describe('main window', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
  })

  test('starts empty: how it works, no clip actions, empty pads', async ({ page }) => {
    const main = mainWindow(page)
    await expect(main.clipCard.getByRole('list', { name: 'How it works' })).toBeVisible()
    await expect(main.send).toHaveCount(0)
    await expect(main.clipButton).toContainText('F8')
    await expect(main.pads.getByText('Fill a pad, then press its key')).toBeVisible()
    await expect(main.pads.getByRole('button', { name: 'Add a sound to pad 1' })).toBeVisible()
  })

  test('the Clip button makes a clip card', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await expect(main.clipCard.getByText('5.0 s')).toBeVisible()
    await expect(main.clipCard.getByRole('list', { name: 'How it works' })).toHaveCount(0)
    await expect(main.send).toBeVisible()
    await expect(main.save).toBeVisible()
  })

  test('the Clip hotkey (F8) makes a clip card', async ({ page }) => {
    const main = mainWindow(page)
    await pressClipHotkey(page)
    await expect(main.clipCard.getByRole('img', { name: 'Current clip waveform' })).toBeVisible()
    await expect(main.preview).toBeVisible()
  })

  test('Preview plays the clip to you and Stop ends it', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await main.preview.click()
    await expect(main.stop).toBeVisible()
    await expect(main.preview).toHaveCount(0)
    await main.stop.click()
    await expect(main.preview).toBeVisible()
    await expect(main.stop).toHaveCount(0)
  })

  test('Send puts the clip on air and Stop takes it off', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await main.send.click()
    await expect(main.stop).toBeVisible()
    await expect(main.clipCard.getByText('on air')).toBeVisible()
    await main.stop.click()
    await expect(main.send).toBeVisible()
    await expect(main.clipCard.getByText('your team')).toBeVisible()
  })

  test('saving the clip to an empty pad fills that pad', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await main.save.click()
    const sheet = page.getByRole('dialog', { name: 'Save clip to a pad' })
    await sheet.getByRole('button', { name: /^1\s*Empty$/ }).click()
    await expect(sheet).toHaveCount(0)
    await expect(main.pads.getByRole('button', { name: 'Play Pad 1' })).toBeVisible()
    await expect(main.pads.getByText('Click a pad or press its key')).toBeVisible()

    // An empty pad also takes the clip when clicked.
    await main.pads.getByRole('button', { name: 'Save the clip to pad 2' }).click()
    await expect(main.pads.getByRole('button', { name: 'Play Pad 2' })).toBeVisible()
  })

  test('playing a pad shows it playing until the sound ends', async ({ page }) => {
    const main = mainWindow(page)
    await clipWithButton(page)
    await main.pads.getByRole('button', { name: 'Save the clip to pad 1' }).click()
    const pad = padKey(page, 0)
    await expect(pad).not.toHaveClass(/\bplaying\b/)
    await main.pads.getByRole('button', { name: 'Play Pad 1' }).click()
    await expect(pad).toHaveClass(/\bplaying\b/)
    // The clip card is not on air: a pad is playing, not the clip.
    await expect(main.send).toBeVisible()
    // The fake plays a pad for as long as its sound lasts (5 s here).
    await expect(pad).not.toHaveClass(/\bplaying\b/, { timeout: 10_000 })
  })
})
