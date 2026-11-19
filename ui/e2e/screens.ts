import type { Page } from '@playwright/test'
import { expect } from './fixtures'
import { clipWithButton, fillPads, mainWindow, openApp, openMainWindow, openPadSheet } from './app'
import { updateEngineSettings } from './fake'

/** One screen of the app, and how to get there from a fresh page. */
export interface Screen {
  name: string
  open: (page: Page) => Promise<void>
}

export const SETTINGS_TABS = ['Mic', 'Clips', 'Keys', 'App'] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

export async function startSetup(page: Page, query = ''): Promise<void> {
  await openApp(page, query)
  await page.getByRole('button', { name: 'Start' }).click()
}

export async function openSettingsTab(page: Page, tab: SettingsTab): Promise<void> {
  await openMainWindow(page)
  await goToSettingsTab(page, tab)
}

/** From the main window, opens Settings on `tab`. */
export async function goToSettingsTab(page: Page, tab: SettingsTab): Promise<void> {
  await page.getByRole('button', { name: 'Settings' }).click()
  const tabButton = page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab', { name: tab })
  await tabButton.click()
  await expect(tabButton).toHaveAttribute('aria-selected', 'true')
}

/** Opens a closed <details> section of Settings, such as Timing or Virtual cable. */
export async function openMore(page: Page, summary: string): Promise<void> {
  const section = page.locator('details').filter({ has: page.locator('summary', { hasText: summary }) })
  await section.locator('summary').click()
  await expect(section).toHaveAttribute('open', '')
}

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 1, name })

/** Every setup step, the main window empty and with a clip, and each Settings tab. */
export const SCREENS: readonly Screen[] = [
  {
    name: 'setup title',
    open: async (page) => openApp(page),
  },
  {
    name: 'setup add the mic (no cable)',
    open: async (page) => {
      await startSetup(page, '?cable=none')
      await expect(page.getByRole('button', { name: 'Install VB-CABLE' })).toBeVisible()
    },
  },
  {
    name: 'setup pick the mic, waiting',
    open: async (page) => {
      await startSetup(page)
      await expect(page.getByRole('status').filter({ hasText: 'Waiting for Discord' })).toBeVisible()
    },
  },
  {
    name: 'setup pick the mic, Discord hears it',
    open: async (page) => {
      await startSetup(page)
      await expect(page.getByRole('status').filter({ hasText: 'Discord can hear Ringpad' })).toBeVisible()
    },
  },
  {
    name: 'setup your keys',
    open: async (page) => {
      await startSetup(page)
      await page.getByRole('button', { name: 'Skip for now' }).click()
      await expect(heading(page, 'Your keys')).toBeVisible()
    },
  },
  {
    name: 'main window, empty',
    open: async (page) => openMainWindow(page),
  },
  {
    name: 'main window, with a clip',
    open: async (page) => {
      await openMainWindow(page)
      await clipWithButton(page)
    },
  },
  ...SETTINGS_TABS.map((tab) => ({
    name: `settings ${tab} tab`,
    open: async (page: Page) => openSettingsTab(page, tab),
  })),
]

/** States inside those screens that show more controls: sheets, and settings that reveal others. */
export const MORE_SCREENS: readonly Screen[] = [
  {
    name: 'main window, pad options sheet',
    open: async (page) => {
      await openMainWindow(page)
      await fillPads(page, 1)
      // The clip card's panda celebrates a pad's new sound for 2 s, swinging its layers wide.
      await expect(page.locator('.clip-panda')).not.toHaveAttribute('data-mood', 'celebrate')
      await openPadSheet(page, 0)
    },
  },
  {
    name: 'main window, save clip sheet',
    open: async (page) => {
      await openMainWindow(page)
      await clipWithButton(page)
      await mainWindow(page).save.click()
      await expect(page.getByRole('dialog', { name: 'Save clip to a pad' })).toBeVisible()
    },
  },
  {
    name: 'settings Mic tab, every option shown',
    open: async (page) => {
      await openSettingsTab(page, 'Mic')
      // The longest timing values, so they are the ones laid out.
      await updateEngineSettings(page, { micMode: 'pushToTalk', pressTalkKeys: 'clipsAndMic', talkLeadMs: 500, talkTailMs: 2000 })
      await openMore(page, 'Timing')
      await openMore(page, 'Virtual cable')
    },
  },
  {
    name: 'settings Clips tab, recording an output device',
    open: async (page) => {
      await openSettingsTab(page, 'Clips')
      await updateEngineSettings(page, { source: { kind: 'device', id: 'speakers' } })
      await expect(page.getByRole('switch', { name: /Play it in my headphones/ })).toBeVisible()
    },
  },
  {
    name: 'settings Keys tab, with pads',
    open: async (page) => {
      await openMainWindow(page)
      await fillPads(page, 2)
      await goToSettingsTab(page, 'Keys')
      await expect(page.getByText('Fill a pad to give it a key.')).toHaveCount(0)
    },
  },
]
