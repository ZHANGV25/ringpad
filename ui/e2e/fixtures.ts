import { test as base, expect } from '@playwright/test'

interface Fixtures {
  /** Fails the test if the page logged a console error or threw, in any test. */
  noConsoleErrors: void
}

export const test = base.extend<Fixtures>({
  noConsoleErrors: [
    async ({ page }, use) => {
      let errors: readonly string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error') errors = [...errors, `console.error: ${message.text()}`]
      })
      page.on('pageerror', (error) => {
        errors = [...errors, `uncaught: ${error.message}`]
      })
      await use()
      expect(errors, 'the page logged errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
