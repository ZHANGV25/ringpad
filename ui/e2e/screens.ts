import type { Page } from '@playwright/test'
import { expect } from './fixtures'
import { clipWithButton, openApp, openMainWindow } from './app'

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
  await page.getByRole('button', { name: 'Settings' }).click()
  const tabButton = page.getByRole('tablist', { name: 'Settings sections' }).getByRole('tab', { name: tab })
  await tabButton.click()
  await expect(tabButton).toHaveAttribute('aria-selected', 'true')
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
