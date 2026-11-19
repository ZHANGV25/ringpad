import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { clipWithButton, fillPads, mainWindow, openMainWindow, openPadSheet, padKey } from './app'
import { capturingKeys, dropFiles, enginePads, pressKey, setNextPickedFile } from './fake'
import { hotkeyRow, rebind, startCapture } from './hotkeys'

/** Where the middle of a pad is, in the physical pixels the engine reports file drops in. */
async function padCentre(page: Page, slot: number): Promise<{ x: number; y: number }> {
  const box = await padKey(page, slot).boundingBox()
  if (!box) throw new Error(`Pad ${slot + 1} is not on screen`)
  const scale = await page.evaluate(() => window.devicePixelRatio)
  return { x: (box.x + box.width / 2) * scale, y: (box.y + box.height / 2) * scale }
}

test.describe('empty pads', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
  })

  test('with no clip, clicking an empty pad picks a sound file and imports it', async ({ page }) => {
    const pads = mainWindow(page).pads
    await pads.getByRole('button', { name: 'Add a sound to pad 3' }).click()
    await expect(pads.getByRole('button', { name: 'Play Air horn' })).toBeVisible()
    await expect(pads.getByRole('img', { name: 'Air horn waveform' })).toBeVisible()
    expect((await enginePads(page))[2]?.name).toBe('Air horn')
  })

  test('closing the file picker without a file leaves the pad empty', async ({ page }) => {
    const pads = mainWindow(page).pads
    await setNextPickedFile(page, null)
    await pads.getByRole('button', { name: 'Add a sound to pad 1' }).click()
    // Commands run in order, so once pad 2 has its sound, pad 1's pick is long over.
    await setNextPickedFile(page, 'C:/Sounds/Boom.wav')
    await pads.getByRole('button', { name: 'Add a sound to pad 2' }).click()
    await expect(pads.getByRole('button', { name: 'Play Boom' })).toBeVisible()
    await expect(pads.getByRole('button', { name: 'Add a sound to pad 1' })).toBeVisible()
    expect((await enginePads(page))[0]).toBeNull()
  })

  test('dropping a sound file on a pad imports it into that pad', async ({ page }) => {
    const pads = mainWindow(page).pads
    const at = await padCentre(page, 4)
    await dropFiles(page, { type: 'enter', paths: ['C:\\Sounds\\Boom.wav'], position: at })
    await expect(padKey(page, 4)).toHaveClass(/\bdrop-target\b/)
    await expect(padKey(page, 4)).toContainText('Drop here')
    await dropFiles(page, { type: 'drop', paths: ['C:\\Sounds\\Boom.wav'], position: at })
    await expect(pads.getByRole('button', { name: 'Play Boom' })).toBeVisible()
    await expect(padKey(page, 4)).not.toHaveClass(/\bdrop-target\b/)
    expect((await enginePads(page))[4]?.name).toBe('Boom')
  })

  test('dragging a file away from the window clears the drop target', async ({ page }) => {
    await dropFiles(page, { type: 'enter', paths: ['C:\\Sounds\\Boom.wav'], position: await padCentre(page, 1) })
    await expect(padKey(page, 1)).toContainText('Drop here')
    await dropFiles(page, { type: 'leave' })
    await expect(padKey(page, 1)).not.toContainText('Drop here')
  })

  test('dropping a file that is not audio says which files work', async ({ page }) => {
    await dropFiles(page, { type: 'drop', paths: ['C:\\notes.txt'], position: await padCentre(page, 0) })
    await expect(page.getByRole('alert')).toHaveText('Drop a WAV, MP3, OGG or FLAC file on a pad.')
    await expect(mainWindow(page).pads.getByRole('button', { name: 'Add a sound to pad 1' })).toBeVisible()
  })
})

test.describe('saving the clip over a pad', () => {
  test('replaces the pad’s sound and name', async ({ page }) => {
    const main = mainWindow(page)
    await openMainWindow(page)
    await main.pads.getByRole('button', { name: 'Add a sound to pad 1' }).click()
    await expect(main.pads.getByRole('button', { name: 'Play Air horn' })).toBeVisible()
    await clipWithButton(page)
    await main.save.click()
    const sheet = page.getByRole('dialog', { name: 'Save clip to a pad' })
    await expect(sheet.getByText('Saving over a pad replaces its sound.')).toBeVisible()
    await sheet.getByRole('button', { name: /^1\s*Air horn$/ }).click()
    await expect(sheet).toHaveCount(0)
    await expect(main.pads.getByRole('button', { name: 'Play Pad 1' })).toBeVisible()
    expect((await enginePads(page))[0]?.seconds).toBe(5)
  })
})

test.describe('pad options sheet', () => {
  test.beforeEach(async ({ page }) => {
    await openMainWindow(page)
    await fillPads(page, 1)
  })

  test('opens from the options button, and Enter renames the pad', async ({ page }) => {
    const sheet = await openPadSheet(page, 0, 'options button')
    const name = sheet.getByRole('textbox', { name: 'Name' })
    await expect(name).toHaveValue('Pad 1')
    await name.fill('Air horn')
    await name.press('Enter')
    await expect(mainWindow(page).pads.getByRole('button', { name: 'Play Air horn' })).toBeVisible()
    expect((await enginePads(page))[0]?.name).toBe('Air horn')
  })

  test('opens with a right-click, and leaving the name field renames the pad', async ({ page }) => {
    const sheet = await openPadSheet(page, 0, 'right-click')
    const name = sheet.getByRole('textbox', { name: 'Name' })
    await name.fill('Boom')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(mainWindow(page).pads.getByRole('button', { name: 'Play Boom' })).toBeVisible()
    expect((await enginePads(page))[0]?.name).toBe('Boom')
  })

  test('the volume slider sets how loud the pad plays', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    const volume = sheet.getByRole('slider', { name: 'Volume' })
    await expect(volume).toHaveValue('0.8')
    await volume.press('Home')
    await expect(volume).toHaveValue('0')
    await expect(sheet.getByText('0%', { exact: true })).toBeVisible()
    await expect.poll(async () => (await enginePads(page))[0]?.volume).toBe(0)
    await volume.press('End')
    await expect(sheet.getByText('100%', { exact: true })).toBeVisible()
    await volume.press('ArrowLeft')
    await expect(sheet.getByText('99%', { exact: true })).toBeVisible()
    await expect.poll(async () => (await enginePads(page))[0]?.volume).toBe(0.99)
  })

  test('the pad key changes to the next key pressed, and then plays the pad', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    const key = hotkeyRow(page, 'Hotkey', sheet)
    await expect(key.chip).toHaveText('F1')
    await rebind(page, key, 'f10')
    await expect(key.chip).toHaveText('F10')
    await expect.poll(async () => (await enginePads(page))[0]?.hotkey).toBe('f10')
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(padKey(page, 0).locator('.key-chip')).toHaveText('F10')
    await pressKey(page, 'f10')
    await expect(padKey(page, 0)).toHaveClass(/\bplaying\b/)
  })

  test('Escape while changing the pad key keeps the old key', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    const key = hotkeyRow(page, 'Hotkey', sheet)
    await rebind(page, key, 'escape')
    await expect(key.chip).toHaveText('F1')
    await expect(sheet).toBeVisible()
    expect(await capturingKeys(page)).toBe(false)
    expect((await enginePads(page))[0]?.hotkey).toBe('f1')
  })

  test('Escape cancels the pad key, not the sheet, whichever of page and engine gets it first', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    const key = hotkeyRow(page, 'Hotkey', sheet)
    // In the real app one Escape press reaches the page and the engine's key capture.
    await rebind(page, key, 'escape')
    await page.keyboard.press('Escape')
    await expect(sheet).toBeVisible()
    await expect(key.change).toBeVisible()

    await startCapture(page, key.change)
    await page.keyboard.press('Escape')
    await pressKey(page, 'escape')
    await expect(sheet).toBeVisible()
    await expect(key.chip).toHaveText('F1')
    expect(await capturingKeys(page)).toBe(false)

    await page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
  })

  test('Clear pad asks first: Keep keeps the sound, Clear empties the pad', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    await sheet.getByRole('button', { name: 'Clear pad' }).click()
    await expect(sheet.getByText('Clear this pad?')).toBeVisible()
    await sheet.getByRole('button', { name: 'Keep' }).click()
    await expect(sheet.getByText('Clear this pad?')).toHaveCount(0)
    expect((await enginePads(page))[0]).not.toBeNull()

    await sheet.getByRole('button', { name: 'Clear pad' }).click()
    await sheet.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(sheet).toHaveCount(0)
    await expect(mainWindow(page).pads.getByRole('button', { name: 'Save the clip to pad 1' })).toBeVisible()
    expect((await enginePads(page))[0]).toBeNull()
  })

  test('Done and a click outside both close the sheet', async ({ page }) => {
    const sheet = await openPadSheet(page, 0)
    await sheet.getByRole('button', { name: 'Done' }).click()
    await expect(sheet).toHaveCount(0)
    await openPadSheet(page, 0)
    await page.getByRole('button', { name: 'Close' }).click({ position: { x: 20, y: 20 } })
    await expect(sheet).toHaveCount(0)
  })
})
