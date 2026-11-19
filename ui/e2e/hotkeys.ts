import type { Locator, Page } from '@playwright/test'
import { expect } from './fixtures'
import { capturingKeys, pressKey } from './fake'

/** One hotkey row (HotkeyRow in views/SettingsHotkeys.tsx) and its parts. */
export interface HotkeyRow {
  row: Locator
  chip: Locator
  hint: Locator
  change: Locator
  cancel: Locator
  clear: Locator
  replace: Locator
}

/** The hotkey row labelled exactly `label` ("Send" is not "Also send"), inside `within`. */
export function hotkeyRow(page: Page, label: string, within: Page | Locator = page): HotkeyRow {
  const name = page.locator('.hotkey-name > span:first-child').getByText(label, { exact: true })
  const row = within.locator('.hotkey-row').filter({ has: name })
  return {
    row,
    chip: row.locator('.key-chip'),
    hint: row.locator('.hotkey-name .hint'),
    change: row.getByRole('button', { name: 'Change', exact: true }),
    cancel: row.getByRole('button', { name: 'Cancel', exact: true }),
    clear: row.getByRole('button', { name: `Clear ${label} hotkey` }),
    replace: row.getByRole('button', { name: 'Replace', exact: true }),
  }
}

/**
 * Clicks a button that asks for a key (Change, Add key) and waits until the engine is listening,
 * so the next key press is captured instead of running a hotkey.
 */
export async function startCapture(page: Page, button: Locator): Promise<void> {
  await button.click()
  await expect.poll(() => capturingKeys(page)).toBe(true)
}

/** Changes a hotkey row to `key` (a keys.ts name) by pressing it when the row asks. */
export async function rebind(page: Page, row: HotkeyRow, key: string): Promise<void> {
  await startCapture(page, row.change)
  await expect(row.chip).toHaveText('Press a key')
  await pressKey(page, key)
}
