import { test as base, expect } from '@playwright/test'

/**
 * Chrome's error when nothing takes the connection: here, the dev server on a busy PC. Windows
 * refuses connections once about 200 wait on a busy Node server. openApp loads the app again then.
 */
export const REFUSED = 'net::ERR_CONNECTION_REFUSED'

/**
 * Chrome's console error when the dev server refused Vite's live-reload socket. It is not the app's
 * (the app uses no sockets), and Vite's client connects again by itself; if that fails as well, it
 * logs "[vite] failed to connect to websocket", which still counts.
 */
export function isLiveReloadRefused(text: string): boolean {
  return /^WebSocket connection to 'ws:\/\/[^/]+\/\?token=[^']*' failed: .*net::ERR_CONNECTION_REFUSED$/.test(text)
}

/** A console error or uncaught exception, and which page load (main-frame navigation) logged it. */
interface LoggedError {
  load: number
  text: string
}

interface Fixtures {
  /** Fails the test if the page logged a console error or threw, in any test. */
  noConsoleErrors: void
}

export const test = base.extend<Fixtures>({
  noConsoleErrors: [
    async ({ page }, use) => {
      let load = 0
      let errors: readonly LoggedError[] = []
      let refusedLoads: ReadonlySet<number> = new Set()
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) load += 1
      })
      page.on('requestfailed', (request) => {
        if (request.failure()?.errorText === REFUSED) refusedLoads = new Set([...refusedLoads, load])
      })
      page.on('console', (message) => {
        if (message.type() === 'error' && !isLiveReloadRefused(message.text())) {
          errors = [...errors, { load, text: `console.error: ${message.text()}` }]
        }
      })
      page.on('pageerror', (error) => {
        errors = [...errors, { load, text: `uncaught: ${error.message}` }]
      })
      await use()
      // A load the dev server cut short was replaced by openApp, so its errors are not the app's.
      // Errors in the last load always count.
      const replaced = (error: LoggedError) => error.load !== load && refusedLoads.has(error.load)
      expect(errors.filter((error) => !replaced(error)).map((error) => error.text), 'the page logged errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
