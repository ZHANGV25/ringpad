import type { Page } from '@playwright/test'

export interface Measured {
  selector: string
  ratio: number
  /** 4.5 for normal text, 3 for large text (WCAG AA). */
  needed: number
}

/**
 * Text contrast measured directly, for the elements axe leaves undecided (a lone digit, a select
 * whose arrow is a drawn gradient). The foreground is the text colour, faded by any opacity on the
 * way up; the background is the stack of background colours behind it, down to the first solid one.
 * Background images are ignored, so this is only for text that sits on a plain colour.
 */
export async function measureContrast(page: Page, selectors: readonly string[]): Promise<Measured[]> {
  return page.evaluate((list) => {
    interface Rgba {
      r: number
      g: number
      b: number
      a: number
    }
    const parse = (value: string): Rgba => {
      const srgb = value.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/)
      if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: Number(srgb[4] ?? 1) }
      const rgb = value.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?: ?[,/] ?([\d.]+))?\)$/)
      if (!rgb) throw new Error(`Cannot read the colour ${value}`)
      return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: Number(rgb[4] ?? 1) }
    }
    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    })
    const luminance = ({ r, g, b }: Rgba) => {
      const linear = [r, g, b].map((channel) => channel / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0)
    }
    const chain = (element: Element | null): Element[] => (element ? [element, ...chain(element.parentElement)] : [])
    return list.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`No element matches ${selector}`)
      const styles = chain(element).map((item) => getComputedStyle(item))
      const layers = styles.map((style) => parse(style.backgroundColor)).filter((color) => color.a > 0)
      const solid = layers.findIndex((color) => color.a === 1)
      const white: Rgba = { r: 255, g: 255, b: 255, a: 1 }
      const stack = solid === -1 ? layers : layers.slice(0, solid + 1)
      const background = stack.reduceRight<Rgba>((below, layer) => over(layer, below), white)
      const opacity = styles.reduce((product, style) => product * Number(style.opacity), 1)
      const text = parse(styles[0]?.color ?? '')
      const foreground = over({ ...text, a: text.a * opacity }, background)
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
      const size = parseFloat(styles[0]?.fontSize ?? '0')
      const bold = Number(styles[0]?.fontWeight ?? 400) >= 700
      const large = size >= 24 || (bold && size >= 18.66)
      return { selector, ratio: ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05), needed: large ? 3 : 4.5 }
    })
  }, selectors)
}
