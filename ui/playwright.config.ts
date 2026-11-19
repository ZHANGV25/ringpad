import { defineConfig, devices } from '@playwright/test'

/** Vite's dev port (vite.config.ts). In a plain browser the UI runs on its fake engine. */
const PORT = 1420
const BASE_URL = `http://localhost:${PORT}`
/** The app window opens at this size (app/tauri.conf.json). */
const WINDOW = { width: 380, height: 680 }
const inCi = Boolean(process.env.CI)
/**
 * Each test loads the unbundled dev build. At 12 workers one local run in eight lost its connection
 * to Vite. On a busy PC Vite still refuses one now and then at 4 to 6 workers; openApp (e2e/app.ts)
 * loads the app again when it does.
 */
const LOCAL_WORKERS = 6

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: inCi,
  retries: inCi ? 1 : 0,
  workers: inCi ? 2 : LOCAL_WORKERS,
  reporter: inCi ? [['list'], ['html', { open: 'never' }]] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    viewport: WINDOW,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], viewport: WINDOW, colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], viewport: WINDOW, colorScheme: 'dark' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !inCi,
    timeout: 60_000,
  },
})
