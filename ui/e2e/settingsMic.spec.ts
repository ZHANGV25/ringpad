import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { mainWindow } from './app'
import { engineDevices, engineSettings, setDevices, setMicUsers, setNextCableInstall } from './fake'
import { watchMeter } from './inspect'
import { goToSettingsTab, openMore, openSettingsTab } from './screens'
import type { DeviceInfo } from '../src/engine/types'

const voice = (page: Page) => page.getByRole('switch', { name: /^Send my voice too/ })
const ducking = (page: Page) => page.getByRole('switch', { name: /^Quiet my mic during clips/ })
const micDevice = (page: Page) => page.getByRole('combobox', { name: 'Mic device' })
const noCable = (page: Page) => page.locator('.callout').filter({ hasText: 'No virtual mic yet' })

async function devicesWithout(page: Page, drop: (device: DeviceInfo) => boolean): Promise<DeviceInfo[]> {
  return (await engineDevices(page)).filter((device) => !drop(device))
}

test.describe('settings: Mic', () => {
  test.beforeEach(async ({ page }) => {
    await openSettingsTab(page, 'Mic')
    await setMicUsers(page, [])
  })

  test('shows where to pick Ringpad’s mic in each app, and checks it live', async ({ page }) => {
    await expect(page.getByRole('figure', { name: 'In Discord › Settings › Voice & Video' })).toBeVisible()
    await page.getByRole('tab', { name: 'Valorant' }).click()
    await expect(page.getByRole('figure', { name: 'In Valorant › Settings › Audio › Voice Chat' })).toBeVisible()
    // Settings has its own place for the game's talk key.
    await expect(page.getByRole('switch', { name: /^Hold V for me/ })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Discord' }).click()
    await setMicUsers(page, [{ pid: 1, exe: 'Discord.exe', name: 'Discord', mic: 'CABLE Output (VB-Audio Virtual Cable)', ringpad: true }])
    await expect(page.getByRole('status').filter({ hasText: 'Discord can hear Ringpad' })).toBeVisible()
  })

  test('Play a test sound shows on the meter of what the team hears', async ({ page }) => {
    const peak = await watchMeter(page.getByRole('meter', { name: 'What your team hears' }))
    await page.getByRole('button', { name: 'Play a test sound' }).click()
    await expect.poll(peak).toBeGreaterThan(90)
  })

  test('Send my voice too turns your mic on and off', async ({ page }) => {
    await expect(voice(page)).toBeChecked()
    await voice(page).click()
    await expect(voice(page)).not.toBeChecked()
    await expect.poll(async () => (await engineSettings(page)).micEnabled).toBe(false)
    await expect(micDevice(page)).toHaveCount(0)
    await expect(ducking(page)).toHaveCount(0)
    await expect(page.getByRole('tablist', { name: 'Your voice' })).toHaveCount(0)
    await voice(page).click()
    await expect.poll(async () => (await engineSettings(page)).micEnabled).toBe(true)
    await expect(micDevice(page)).toBeVisible()
  })

  test('Mic device picks your real mic, never a virtual one', async ({ page }) => {
    await expect(micDevice(page).locator('option')).toHaveText(['Default mic', 'Microphone'])
    await micDevice(page).selectOption('mic')
    await expect.poll(async () => (await engineSettings(page)).mic).toBe('mic')
    await micDevice(page).selectOption('')
    await expect.poll(async () => (await engineSettings(page)).mic).toBeNull()
  })

  test('Quiet my mic during clips', async ({ page }) => {
    await expect(ducking(page)).toBeChecked()
    await ducking(page).click()
    await expect.poll(async () => (await engineSettings(page)).ducking).toBe(false)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(mainWindow(page).clipCard).toBeVisible()
    await goToSettingsTab(page, 'Mic')
    await expect(ducking(page)).not.toBeChecked()
  })

  test('Virtual cable picks which virtual mic clips play into', async ({ page }) => {
    await openMore(page, 'Virtual cable')
    const cable = page.getByRole('combobox', { name: 'Virtual mic' })
    await expect(cable.locator('option')).toHaveText(['CABLE Input (VB-Audio Virtual Cable)', 'Voicemod Virtual Audio Device'])
    await expect(cable).toHaveValue('vb-output')
    await cable.selectOption('voicemod-output')
    await expect.poll(async () => (await engineSettings(page)).virtualOutput).toBe('voicemod-output')
    await expect(page.getByRole('button', { name: 'Install VB-CABLE instead' })).toHaveCount(0)
  })

  test('with only another virtual cable, VB-CABLE is one click away', async ({ page }) => {
    await setDevices(page, await devicesWithout(page, (device) => device.virtualCable === 'vbcable'))
    await openMore(page, 'Virtual cable')
    const cable = page.getByRole('combobox', { name: 'Virtual mic' })
    await expect(cable.locator('option')).toHaveText(['Voicemod Virtual Audio Device'])
    await page.getByRole('button', { name: 'Install VB-CABLE instead' }).click()
    await expect(cable.locator('option')).toHaveText(['Voicemod Virtual Audio Device', 'CABLE Input (VB-Audio Virtual Cable)'])
    await expect(page.getByRole('button', { name: 'Install VB-CABLE instead' })).toHaveCount(0)
    await expect.poll(async () => (await engineSettings(page)).virtualOutput).toBe('vb-output')
  })

  test('with no virtual mic, offers to install one', async ({ page }) => {
    await setDevices(page, await devicesWithout(page, (device) => device.virtualCable !== null))
    await expect(noCable(page)).toBeVisible()
    await expect(page.getByRole('figure')).toHaveCount(0)
    await setNextCableInstall(page, 'declined')
    await noCable(page).getByRole('button', { name: 'Install VB-CABLE' }).click()
    await expect(noCable(page)).toContainText('Windows needs a Yes. Try again.')
    await setNextCableInstall(page, 'installed')
    await noCable(page).getByRole('button', { name: 'Install VB-CABLE' }).click()
    await expect(noCable(page)).toHaveCount(0)
    await expect(page.getByRole('figure', { name: 'In Discord › Settings › Voice & Video' })).toBeVisible()
  })

  test('Check again finds a virtual mic added outside Ringpad', async ({ page }) => {
    const all = await engineDevices(page)
    await setDevices(page, all.filter((device) => device.virtualCable === null))
    await expect(noCable(page)).toBeVisible()
    // Installed by hand; Ringpad has not heard about it yet.
    await setDevices(page, all, true)
    await expect(noCable(page)).toBeVisible()
    await noCable(page).getByRole('button', { name: 'Check again' }).click()
    await expect(noCable(page)).toHaveCount(0)
  })

  test('warns when Windows plays all sound into Ringpad’s mic', async ({ page }) => {
    const warning = page.getByRole('alert').filter({ hasText: 'Windows is playing all sound into Ringpad’s mic' })
    await expect(warning).toHaveCount(0)
    const devices = (await engineDevices(page)).map((device) =>
      device.direction === 'output' ? { ...device, isDefault: device.virtualCable === 'vbcable' } : device,
    )
    await setDevices(page, devices)
    await expect(warning).toContainText('Set your Windows sound output back to your headphones.')
  })
})
