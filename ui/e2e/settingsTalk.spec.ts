import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { blockTalkKeys, capturingKeys, engineSettings, pressKey, updateEngineSettings } from './fake'
import { hotkeyRow, rebind, startCapture } from './hotkeys'
import { openMore, openSettingsTab } from './screens'

const yourVoice = (page: Page) => page.getByRole('tablist', { name: 'Your voice' })
const holdGameKey = (page: Page) => page.getByRole('tablist', { name: "Hold my game's talk key" })
const gameKeys = (page: Page) => page.locator('.talk-key-list')

test.describe('settings: your voice and the talk key', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingsTab(page, 'Mic')
  })

  test('Hold a key asks for a talk key, set by pressing it', async ({ page }) => {
    await expect(yourVoice(page).getByRole('tab', { name: 'Always on' })).toHaveAttribute('aria-selected', 'true')
    await expect(hotkeyRow(page, 'Talk key').row).toHaveCount(0)
    await yourVoice(page).getByRole('tab', { name: 'Hold a key' }).click()
    await expect.poll(async () => (await engineSettings(page)).micMode).toBe('pushToTalk')
    await expect(page.getByText('Pick a talk key. Until then your voice stays off.')).toBeVisible()

    const talk = hotkeyRow(page, 'Talk key')
    await expect(talk.chip).toHaveText('None')
    await rebind(page, talk, 't')
    await expect(talk.chip).toHaveText('T')
    await expect.poll(async () => (await engineSettings(page)).hotkeys.talk).toBe('t')
    await expect(page.getByText('Pick a talk key. Until then your voice stays off.')).toHaveCount(0)
  })

  test('Press to toggle and Always on', async ({ page }) => {
    await yourVoice(page).getByRole('tab', { name: 'Press to toggle' }).click()
    await expect.poll(async () => (await engineSettings(page)).micMode).toBe('toggle')
    await expect(hotkeyRow(page, 'Talk key').row).toBeVisible()
    await yourVoice(page).getByRole('tab', { name: 'Always on' }).click()
    await expect.poll(async () => (await engineSettings(page)).micMode).toBe('open')
    await expect(hotkeyRow(page, 'Talk key').row).toHaveCount(0)
  })

  test('a talk key Ringpad already uses asks before moving it', async ({ page }) => {
    await updateEngineSettings(page, { micMode: 'pushToTalk' })
    const talk = hotkeyRow(page, 'Talk key')
    await rebind(page, talk, 'f8')
    await expect(talk.row).toContainText('F8 is used by Clip. Use it here instead?')
    await talk.cancel.click()
    await expect(talk.chip).toHaveText('None')
    expect((await engineSettings(page)).hotkeys.grab).toBe('f8')

    await rebind(page, talk, 'f8')
    await talk.replace.click()
    await expect(talk.chip).toHaveText('F8')
    await expect.poll(async () => (await engineSettings(page)).hotkeys).toMatchObject({ talk: 'f8', grab: null })
  })

  test('Clear removes the talk key', async ({ page }) => {
    await updateEngineSettings(page, { micMode: 'toggle', hotkeys: { ...(await engineSettings(page)).hotkeys, talk: 't' } })
    const talk = hotkeyRow(page, 'Talk key')
    await talk.clear.click()
    await expect(talk.chip).toHaveText('None')
    await expect.poll(async () => (await engineSettings(page)).hotkeys.talk).toBeNull()
    await expect(talk.clear).toBeDisabled()
  })
})

test.describe('settings: the game’s talk key', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingsTab(page, 'Mic')
  })

  test('Hold my game’s talk key: off, during clips, or clips and my voice', async ({ page }) => {
    await expect(holdGameKey(page).getByRole('tab', { name: 'Off' })).toHaveAttribute('aria-selected', 'true')
    await expect(gameKeys(page)).toHaveCount(0)
    await holdGameKey(page).getByRole('tab', { name: 'During clips' }).click()
    await expect.poll(async () => (await engineSettings(page)).pressTalkKeys).toBe('clips')
    await expect(gameKeys(page).locator('.key-chip')).toHaveText(['V'])

    await holdGameKey(page).getByRole('tab', { name: 'Clips and my voice' }).click()
    await expect.poll(async () => (await engineSettings(page)).pressTalkKeys).toBe('clipsAndMic')
    // With your voice always on there is no talking to hold the key for.
    await expect(page.getByText('Pick Hold a key or Press to toggle above for your voice to count.')).toBeVisible()
    await yourVoice(page).getByRole('tab', { name: 'Hold a key' }).click()
    await expect(page.getByText('Pick Hold a key or Press to toggle above for your voice to count.')).toHaveCount(0)

    await holdGameKey(page).getByRole('tab', { name: 'Off' }).click()
    await expect.poll(async () => (await engineSettings(page)).pressTalkKeys).toBe('off')
    await expect(gameKeys(page)).toHaveCount(0)
  })

  test('game keys: add by pressing a key, up to three, and remove', async ({ page }) => {
    await updateEngineSettings(page, { pressTalkKeys: 'clips' })
    const chips = gameKeys(page).locator('.key-chip')
    const add = gameKeys(page).getByRole('button', { name: 'Add key' })
    await expect(gameKeys(page).getByRole('button', { name: 'Remove V' })).toBeDisabled()

    await startCapture(page, add)
    await expect(gameKeys(page).getByRole('button', { name: 'Press a key' })).toBeVisible()
    await pressKey(page, 'b')
    await expect(chips).toHaveText(['V', 'B'])
    await startCapture(page, add)
    await pressKey(page, 'n')
    await expect(chips).toHaveText(['V', 'B', 'N'])
    await expect(add).toHaveCount(0)
    await expect.poll(async () => (await engineSettings(page)).gameTalkKeys).toEqual(['v', 'b', 'n'])

    await gameKeys(page).getByRole('button', { name: 'Remove B' }).click()
    await expect(chips).toHaveText(['V', 'N'])
    await expect.poll(async () => (await engineSettings(page)).gameTalkKeys).toEqual(['v', 'n'])
  })

  test('Escape while adding a game key adds nothing', async ({ page }) => {
    await updateEngineSettings(page, { pressTalkKeys: 'clips' })
    await startCapture(page, gameKeys(page).getByRole('button', { name: 'Add key' }))
    await pressKey(page, 'escape')
    await expect(gameKeys(page).getByRole('button', { name: 'Add key' })).toBeVisible()
    await expect(gameKeys(page).locator('.key-chip')).toHaveText(['V'])
    expect(await capturingKeys(page)).toBe(false)
  })

  test('Test holds the game keys for a moment', async ({ page }) => {
    await updateEngineSettings(page, { pressTalkKeys: 'clips', gameTalkKeys: ['v', 'b'] })
    const holding = page.locator('.talk-test-row').getByText('Holding V + B')
    await page.getByRole('button', { name: 'Test', exact: true }).click()
    await expect(holding).toBeVisible()
    // The fake holds them for 2 s, like the real engine.
    await expect(holding).toHaveCount(0, { timeout: 10_000 })
  })

  test('a blocked key press says why, and so does Test', async ({ page }) => {
    const message = 'Windows blocked VALORANT. Run Ringpad as administrator.'
    await updateEngineSettings(page, { pressTalkKeys: 'clips' })
    await blockTalkKeys(page, message)
    const alerts = page.getByRole('alert').filter({ hasText: message })
    await expect(alerts).toHaveCount(1)
    await page.getByRole('button', { name: 'Test', exact: true }).click()
    // The inline reason, and the notice the failed test raises.
    await expect(alerts).toHaveCount(2)
  })

  test('Timing: head start, release delay, and only when an app is in front', async ({ page }) => {
    await updateEngineSettings(page, { pressTalkKeys: 'clips' })
    await openMore(page, 'Timing')
    await page.getByRole('slider', { name: 'Head start' }).press('ArrowRight')
    await page.getByRole('slider', { name: 'Release delay' }).press('End')
    await expect.poll(async () => {
      const settings = await engineSettings(page)
      return [settings.talkLeadMs, settings.talkTailMs]
    }).toEqual([110, 2000])

    const front = page.getByRole('combobox', { name: 'Only when this app is in front' })
    await expect(front).toHaveValue('')
    await front.selectOption({ label: 'VALORANT' })
    await expect.poll(async () => (await engineSettings(page)).talkOnlyApp).toBe('VALORANT-Win64-Shipping.exe')
    await front.selectOption({ label: 'Any app' })
    await expect.poll(async () => (await engineSettings(page)).talkOnlyApp).toBeNull()
  })
})
