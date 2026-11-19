import { expect, isLiveReloadRefused, test } from './fixtures'
import { openApp } from './app'

test.describe('the test harness', () => {
  test('a refused live-reload socket is not counted as the app’s error, anything else is', () => {
    expect(isLiveReloadRefused("WebSocket connection to 'ws://localhost:1420/?token=abc123' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED")).toBe(true)
    expect(isLiveReloadRefused("WebSocket connection to 'ws://localhost:1420/?token=abc' failed: Error in connection establishment: net::ERR_CONNECTION_RESET")).toBe(false)
    expect(isLiveReloadRefused('[vite] failed to connect to websocket.')).toBe(false)
    expect(isLiveReloadRefused('Failed to load resource: net::ERR_CONNECTION_REFUSED')).toBe(false)
  })

  test('a load the dev server cut short is loaded again, and its errors are not the app’s', async ({ page }) => {
    let refusals = 0
    await page.route(/\/src\/App\.tsx/, async (route) => {
      if (refusals === 0) {
        refusals += 1
        await route.abort('connectionrefused')
      } else {
        await route.continue()
      }
    })
    await openApp(page)
    expect(refusals).toBe(1)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('a refused page itself is loaded again', async ({ page }) => {
    let refusals = 0
    await page.route((url) => url.pathname === '/', async (route) => {
      if (refusals === 0) {
        refusals += 1
        await route.abort('connectionrefused')
      } else {
        await route.continue()
      }
    })
    await openApp(page)
    expect(refusals).toBe(1)
  })
})
