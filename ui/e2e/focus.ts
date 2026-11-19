import type { Page } from '@playwright/test'

/** One control reached with Tab, and what is wrong with its focus ring (nothing, when it shows). */
export interface FocusStop {
  name: string
  problems: string[]
}

export interface TabWalk {
  /** Tabbable controls that Tab never reached. */
  missed: string[]
  /** The controls Tab reached, in order. */
  stops: FocusStop[]
}

interface Tabbable {
  id: string
  name: string
}

/**
 * Presses Tab until every tabbable control on the page has had focus, checking the focus ring each
 * time. Tabbable means enabled, shown, and in the tab order: a tab group's unselected tabs are
 * reached with the arrow keys instead, and a closed <details> hides its controls.
 */
export async function walkWithTab(page: Page): Promise<TabWalk> {
  // A hovered button dims (.button.primary:hover); move the pointer off so only focus shows.
  await page.mouse.move(0, 0)
  const tabbable = await markTabbable(page)
  const stops: FocusStop[] = []
  const seen = new Set<string>()
  const reachedAll = () => tabbable.every((control) => seen.has(control.id))
  // Focus starts wherever it is and wraps through the browser's own UI, so two laps cover it all.
  for (let press = 0; press < tabbable.length * 2 + 4 && !reachedAll(); press += 1) {
    await page.keyboard.press('Tab')
    const stop = await focusedStop(page)
    if (stop === null || seen.has(stop.id)) continue
    seen.add(stop.id)
    stops.push({ name: stop.name, problems: stop.problems })
  }
  return { missed: tabbable.filter((control) => !seen.has(control.id)).map((control) => control.name), stops }
}

/** Tags each tabbable control with `data-e2e-tab` and returns them in page order. */
async function markTabbable(page: Page): Promise<Tabbable[]> {
  return page.evaluate(() => {
    const name = (element: HTMLElement) =>
      `${element.tagName.toLowerCase()} "${element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ') ?? ''}"`
    // checkVisibility also hides what a closed <details> holds (content-visibility: hidden).
    const shown = (element: HTMLElement) => element.checkVisibility({ visibilityProperty: true })
    const controls = Array.from(document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]'))
    return controls
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && shown(element))
      .map((element, index) => {
        element.dataset.e2eTab = String(index)
        return { id: String(index), name: name(element) }
      })
  })
}

interface FocusedStop extends FocusStop {
  id: string
}

/**
 * The focused control and its ring: the browser shows it as keyboard focus (:focus-visible), draws
 * an outline, nothing fades it out, and neither the window nor a box that clips its content cuts
 * the ring off. A fade-in on focus (the pad options button) is let finish first.
 */
async function focusedStop(page: Page): Promise<FocusedStop | null> {
  return page.evaluate(async () => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement) || element === document.body) return null
    const chain = (start: Element | null): Element[] => (start ? [start, ...chain(start.parentElement)] : [])
    const ancestors = chain(element)
    const settling = document.getAnimations().filter((animation) => {
      const effect = animation.effect
      const target = effect instanceof KeyframeEffect ? effect.target : null
      return target !== null && ancestors.includes(target) && effect?.getComputedTiming().iterations !== Infinity
    })
    await Promise.all(settling.map((animation) => animation.finished.catch(() => undefined)))

    const style = getComputedStyle(element)
    const width = parseFloat(style.outlineWidth) || 0
    const problems: string[] = []
    if (!element.matches(':focus-visible')) problems.push('not shown as keyboard focus')
    if (style.outlineStyle === 'none' || width < 1) problems.push(`no outline (${style.outlineStyle} ${style.outlineWidth})`)
    const opacity = ancestors.reduce((product, item) => product * Number(getComputedStyle(item).opacity), 1)
    if (opacity < 0.9) problems.push(`faded to opacity ${opacity.toFixed(2)}`)

    const grow = width + (parseFloat(style.outlineOffset) || 0)
    const box = element.getBoundingClientRect()
    const ring = { left: box.left - grow, top: box.top - grow, right: box.right + grow, bottom: box.bottom + grow }
    const clips = (item: Element) => {
      const { overflowX, overflowY } = getComputedStyle(item)
      return overflowX !== 'visible' || overflowY !== 'visible'
    }
    const inside = (item: Element) => {
      const rect = item.getBoundingClientRect()
      const left = rect.left + item.clientLeft
      const top = rect.top + item.clientTop
      return { name: `${item.tagName.toLowerCase()}.${item.className}`, left, top, right: left + item.clientWidth, bottom: top + item.clientHeight }
    }
    const window_ = { name: 'the window', left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    const boxes = [window_, ...ancestors.slice(1).filter(clips).map(inside)]
    const SLACK = 0.5
    boxes
      .filter((clip) => ring.left < clip.left - SLACK || ring.top < clip.top - SLACK || ring.right > clip.right + SLACK || ring.bottom > clip.bottom + SLACK)
      .forEach((clip) => problems.push(`ring cut off by ${clip.name}`))

    const label = element.getAttribute('aria-label') ?? element.textContent?.trim().replace(/\s+/g, ' ') ?? ''
    return { id: element.dataset.e2eTab ?? `unmarked ${label}`, name: `${element.tagName.toLowerCase()} "${label}"`, problems }
  })
}
