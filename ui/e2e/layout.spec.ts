import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { settleFades } from './app'
import { SCREENS } from './screens'

/** The smallest the app window can be made (app/tauri.conf.json). */
const MIN_WINDOW = { width: 340, height: 520 }

/**
 * Everything that sticks out past the window's left or right edge, or makes a box scroll sideways.
 * Content that a component clips on purpose (an ellipsis, the gliding tape) is judged by the box
 * that clips it. The page shells hide overflow, so being clipped by one still counts as sticking out.
 */
async function sidewaysOverflow(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const root = document.getElementById('root')
    const isShell = (element: Element) =>
      element === document.documentElement || element === document.body || element === root || element.parentElement === root
    const clipper = (element: Element): Element | null => {
      const parent = element.parentElement
      if (!parent) return null
      return getComputedStyle(parent).overflowX === 'visible' ? clipper(parent) : parent
    }
    const name = (element: Element) =>
      `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`
    return Array.from(document.body.querySelectorAll('*')).flatMap((element) => {
      const style = getComputedStyle(element)
      if (style.display === 'none' || style.visibility === 'hidden') return []
      const scrolls = (style.overflowX === 'auto' || style.overflowX === 'scroll') && element.scrollWidth > element.clientWidth + 1
      const scrollProblem = scrolls ? [`${name(element)} scrolls sideways (${element.scrollWidth} > ${element.clientWidth})`] : []
      const box = clipper(element)
      if (box && !isShell(box)) return scrollProblem
      const rect = element.getBoundingClientRect()
      const outside = rect.width > 0 && rect.height > 0 && (rect.left < -1 || rect.right > width + 1)
      return outside ? [...scrollProblem, `${name(element)} spans ${Math.round(rect.left)}..${Math.round(rect.right)} of ${width}`] : scrollProblem
    })
  })
}

test.describe('nothing overflows sideways at the minimum window size', () => {
  test.use({ viewport: MIN_WINDOW })

  for (const screen of SCREENS) {
    test(screen.name, async ({ page }) => {
      await screen.open(page)
      await settleFades(page)
      expect(await sidewaysOverflow(page)).toEqual([])
    })
  }
})
