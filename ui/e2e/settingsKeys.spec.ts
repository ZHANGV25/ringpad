import { expect, test } from './fixtures'
import { fillPads, mainWindow, openMainWindow, padKey } from './app'
import { capturingKeys, enginePads, engineSettings, pressKey } from './fake'
import { hotkeyRow, rebind } from './hotkeys'
import { goToSettingsTab, openSettingsTab } from './screens'
import type { Hotkeys } from '../src/engine/types'

/** Each clip hotkey row on the Keys tab, the setting it changes, and a free key to move it to. */
const ROWS: ReadonlyArray<{ label: string; setting: keyof Hotkeys; key: string; shows: string }> = [
  { label: 'Clip', setting: 'grab', key: 'f10', shows: 'F10' },
  { label: 'Send', setting: 'send', key: 'f11', shows: 'F11' },
  { label: 'Stop', setting: 'stop', key: 'f12', shows: 'F12' },
  { label: 'Save to pad', setting: 'save', key: 'insert', shows: 'Insert' },
  { label: 'Also send', setting: 'sendAlt', key: 'mouse4', shows: 'Mouse 4 (lower side)' },
]

test.describe('settings: Keys', () => {
  test('every clip hotkey changes to the next key pressed', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    await expect(hotkeyRow(page, 'Clip').hint).toHaveText('Grabs the last 5 s')
    for (const { label, key, shows } of ROWS) {
      const row = hotkeyRow(page, label)
      await rebind(page, row, key)
      await expect(row.chip).toHaveText(shows)
    }
    await expect.poll(async () => (await engineSettings(page)).hotkeys).toMatchObject(
      Object.fromEntries(ROWS.map(({ setting, key }) => [setting, key])),
    )
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(mainWindow(page).clipButton).toContainText('F10')
  })

  test('a changed hotkey works from then on', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    await rebind(page, hotkeyRow(page, 'Clip'), 'f10')
    await page.getByRole('button', { name: 'Back' }).click()
    await pressKey(page, 'f10')
    await expect(mainWindow(page).clipCard.getByRole('img', { name: 'Current clip waveform' })).toBeVisible()
  })

  test('Escape cancels a key change and keeps the old key', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    const clip = hotkeyRow(page, 'Clip')
    await rebind(page, clip, 'escape')
    await expect(clip.chip).toHaveText('F8')
    expect(await capturingKeys(page)).toBe(false)
    expect((await engineSettings(page)).hotkeys.grab).toBe('f8')
  })

  test('Cancel stops listening for a key', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    const stop = hotkeyRow(page, 'Stop')
    await stop.change.click()
    await expect(stop.chip).toHaveText('Press a key')
    await stop.cancel.click()
    await expect(stop.chip).toHaveText('F9')
    await expect.poll(() => capturingKeys(page)).toBe(false)
  })

  test('Clear removes a hotkey', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    const send = hotkeyRow(page, 'Send')
    await send.clear.click()
    await expect(send.chip).toHaveText('None')
    await expect(send.clear).toBeDisabled()
    await expect.poll(async () => (await engineSettings(page)).hotkeys.send).toBeNull()
  })

  test('a key already in use asks first: Cancel keeps both, Replace moves it', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    const clip = hotkeyRow(page, 'Clip')
    await rebind(page, clip, 'f7')
    await expect(clip.row).toContainText('F7 is used by Send. Use it here instead?')
    await clip.cancel.click()
    await expect(clip.chip).toHaveText('F8')

    await rebind(page, clip, 'f7')
    await clip.replace.click()
    await expect(clip.chip).toHaveText('F7')
    await expect(hotkeyRow(page, 'Send').chip).toHaveText('None')
    await expect.poll(async () => (await engineSettings(page)).hotkeys).toMatchObject({ grab: 'f7', send: null })
  })

  test('filled pads get a key row; a new pad key plays that pad', async ({ page }) => {
    await openSettingsTab(page, 'Keys')
    await expect(page.getByText('Fill a pad to give it a key.')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await fillPads(page, 2)
    await goToSettingsTab(page, 'Keys')
    await expect(hotkeyRow(page, 'Pad 1').chip).toHaveText('F1')
    await expect(hotkeyRow(page, 'Pad 2').chip).toHaveText('F2')

    await rebind(page, hotkeyRow(page, 'Pad 1'), 'f5')
    await expect(hotkeyRow(page, 'Pad 1').chip).toHaveText('F5')
    await expect.poll(async () => (await enginePads(page))[0]?.hotkey).toBe('f5')
    await page.getByRole('button', { name: 'Back' }).click()
    await pressKey(page, 'f5')
    await expect(padKey(page, 0)).toHaveClass(/\bplaying\b/)
  })

  test('taking another pad’s key clears it from that pad', async ({ page }) => {
    await openMainWindow(page)
    await fillPads(page, 2)
    await goToSettingsTab(page, 'Keys')
    const first = hotkeyRow(page, 'Pad 1')
    await rebind(page, first, 'f2')
    await expect(first.row).toContainText('F2 is used by Pad 2. Use it here instead?')
    await first.replace.click()
    await expect(first.chip).toHaveText('F2')
    await expect(hotkeyRow(page, 'Pad 2').chip).toHaveText('None')
    await expect.poll(async () => (await enginePads(page)).map((pad) => pad?.hotkey ?? null).slice(0, 2)).toEqual(['f2', null])
  })
})
