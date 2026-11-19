import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { pressClipHotkey } from './app'
import { engineSettings, openedUrl, pressKey, setMicUsers, setNextCableInstall } from './fake'
import { hotkeyRow, rebind } from './hotkeys'
import { startSetup } from './screens'
import type { MicUser } from '../src/engine/types'

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })
const check = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text })
const DISCORD_ON_ITS_OWN_MIC: MicUser = { pid: 4242, exe: 'Discord.exe', name: 'Discord', mic: 'Microphone (Realtek Audio)', ringpad: false }

test.describe('setup: use Ringpad’s mic', () => {
  test.beforeEach(async ({ page }) => {
    await startSetup(page)
    // Nobody is listening until a test says so.
    await setMicUsers(page, [])
  })

  test('the Valorant tab shows its setting and offers to hold the talk key during clips', async ({ page }) => {
    await page.getByRole('tablist', { name: 'Where you talk' }).getByRole('tab', { name: 'Valorant' }).click()
    await expect(page.getByRole('figure', { name: 'In Valorant › Settings › Audio › Voice Chat' })).toBeVisible()
    await expect(page.getByText('Noise suppression')).toHaveCount(0)
    await expect(check(page, 'Waiting for Valorant…')).toContainText('Join a match or party so Ringpad can check.')

    const hold = page.getByRole('switch', { name: /^Hold V for me while a clip plays/ })
    await expect(hold).not.toBeChecked()
    await hold.click()
    await expect(hold).toBeChecked()
    // Only while Valorant is in front, so a V never lands in a chat box.
    await expect.poll(async () => engineSettings(page)).toMatchObject({ pressTalkKeys: 'clips', talkOnlyApp: 'VALORANT-Win64-Shipping.exe' })
    await hold.click()
    await expect(hold).not.toBeChecked()
    await expect.poll(async () => (await engineSettings(page)).pressTalkKeys).toBe('off')
  })

  test('the Other tab covers any voice app', async ({ page }) => {
    await page.getByRole('tab', { name: 'Other' }).click()
    await expect(page.getByRole('figure', { name: 'In Your app › Settings › Voice or Audio' })).toBeVisible()
    await expect(check(page, 'Waiting for your app…')).toContainText('Start a call so Ringpad can check.')
    await expect(page.getByRole('switch', { name: /^Hold V/ })).toHaveCount(0)
  })

  test('the Discord tab shows the input device and the two settings that cut clips', async ({ page }) => {
    const mock = page.getByRole('figure', { name: 'In Discord › Settings › Voice & Video' })
    await expect(mock).toContainText('Input device')
    await expect(mock).toContainText('CABLE Output (VB-Audio Virtual Cable)')
    const row = (label: string) => mock.locator('.mock-row').filter({ hasText: label })
    await expect(row('Noise suppression')).toContainText('None')
    await expect(row('Echo cancellation')).toContainText('Off')
    await expect(page.getByText('Your voice goes through it too.')).toBeVisible()
  })

  test('says when Discord is on another mic and which one to pick, then when it hears Ringpad', async ({ page }) => {
    await setMicUsers(page, [DISCORD_ON_ITS_OWN_MIC])
    await expect(check(page, 'Discord is using')).toHaveText('Discord is using Microphone (Realtek Audio). Pick CABLE Output instead.')
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()

    // Valorant's tab does not blame Discord.
    await page.getByRole('tab', { name: 'Valorant' }).click()
    await expect(check(page, 'Waiting for Valorant…')).toBeVisible()
    await page.getByRole('tab', { name: 'Discord' }).click()

    await setMicUsers(page, [{ ...DISCORD_ON_ITS_OWN_MIC, mic: 'CABLE Output (VB-Audio Virtual Cable)', ringpad: true }])
    await expect(check(page, 'Discord can hear Ringpad')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
  })
})

test.describe('setup: add the mic', () => {
  test.beforeEach(async ({ page }) => {
    await startSetup(page, '?cable=none')
    await expect(heading(page, 'Add the mic')).toBeVisible()
  })

  test('No at the Windows prompt asks to try again, and trying again installs it', async ({ page }) => {
    const install = page.getByRole('button', { name: 'Install VB-CABLE' })
    await setNextCableInstall(page, 'declined')
    await install.click()
    await expect(page.getByText('Windows needs a Yes. Try again.')).toBeVisible()
    await expect(install).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()

    await setNextCableInstall(page, 'installed')
    await install.click()
    await expect(page.getByText('Installed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()
    await expect.poll(async () => (await engineSettings(page)).virtualOutput).toBe('vb-output')
  })

  test('an install that needs a restart says so', async ({ page }) => {
    await setNextCableInstall(page, 'needsRestart')
    await page.getByRole('button', { name: 'Install VB-CABLE' }).click()
    await expect(page.getByText('Restart your PC to finish.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible()
  })

  test('a failed install says why', async ({ page }) => {
    await setNextCableInstall(page, { error: 'The VB-CABLE setup is missing' })
    await page.getByRole('button', { name: 'Install VB-CABLE' }).click()
    await expect(page.getByText('The VB-CABLE setup is missing')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Install VB-CABLE' })).toBeEnabled()
  })

  test('the VB-CABLE credit opens VB-Audio’s site', async ({ page }) => {
    await page.getByRole('button', { name: 'www.vb-cable.com' }).click()
    await expect.poll(() => openedUrl(page)).toBe('https://vb-audio.com/Cable/')
  })

  test('after skipping the install, going back from the keys says to add the mic first', async ({ page }) => {
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(heading(page, 'Your keys')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, 'Use Ringpad’s mic')).toBeVisible()
    await expect(page.getByText('Add the mic first. Go back, or do it later in Settings.')).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, 'Add the mic')).toBeVisible()
  })
})

test.describe('setup: your keys', () => {
  test.beforeEach(async ({ page }) => {
    await startSetup(page)
    await page.getByRole('button', { name: 'Skip for now' }).click()
    await expect(heading(page, 'Your keys')).toBeVisible()
  })

  test('sending the clip with F7 ticks off Send', async ({ page }) => {
    const send = hotkeyRow(page, 'Send')
    await expect(send.hint).toHaveText('Plays it to your team.')
    await pressClipHotkey(page)
    await expect(send.hint).toHaveText('Now press F7.')
    await pressKey(page, 'f7')
    await expect(send.hint).toHaveText('✓ Your team heard it.')
  })

  test('a key can be changed by pressing it, but not cleared', async ({ page }) => {
    const clip = hotkeyRow(page, 'Clip')
    await expect(clip.clear).toHaveCount(0)
    await rebind(page, clip, 'f10')
    await expect(clip.chip).toHaveText('F10')
    await expect.poll(async () => (await engineSettings(page)).hotkeys.grab).toBe('f10')
    await pressKey(page, 'f10')
    await expect(clip.hint).toHaveText('✓ Got it. You heard it back.')
  })

  test('Back returns to picking the mic', async ({ page }) => {
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, 'Use Ringpad’s mic')).toBeVisible()
  })
})
