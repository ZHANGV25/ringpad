import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'
import { settleFades } from './app'
import { measureContrast } from './contrast'
import { SCREENS } from './screens'

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>
type AxeNode = AxeResults['violations'][number]['nodes'][number]

/** Each failing element with axe's reason, so a failure says what to fix. */
function describe(results: AxeResults): string[] {
  return results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? violation.help}`),
  )
}

/** A plain CSS selector for the node; null for one inside a shadow root or frame. */
function selectorOf(node: AxeNode): string | null {
  const [only, ...rest] = node.target
  return typeof only === 'string' && rest.length === 0 ? only : null
}

test.describe('text contrast is WCAG AA', () => {
  for (const screen of SCREENS) {
    test(screen.name, async ({ page }) => {
      await screen.open(page)
      await settleFades(page)
      const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      expect(describe(results), 'axe found text below AA').toEqual([])

      // axe cannot decide some text (a lone pad number, a select with a drawn arrow): measure it.
      const undecided = results.incomplete.flatMap((rule) => rule.nodes)
      const selectors = undecided.map(selectorOf).filter((selector): selector is string => selector !== null)
      expect(selectors, 'axe left text it could not locate').toHaveLength(undecided.length)
      const low = (await measureContrast(page, selectors)).filter((item) => item.ratio < item.needed)
      expect(low.map((item) => `${item.selector}: ${item.ratio.toFixed(2)} < ${item.needed}`), 'text below AA').toEqual([])
    })
  }
})
