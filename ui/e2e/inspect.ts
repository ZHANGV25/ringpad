import type { Locator } from '@playwright/test'

/**
 * Starts recording the highest level a meter (LevelMeter, role meter) reports, and returns a
 * reader for it. A meter falls as soon as the sound stops, so a test reads the peak it reached
 * instead of racing the fall.
 */
export async function watchMeter(meter: Locator): Promise<() => Promise<number>> {
  await meter.evaluate((element) => {
    const level = () => Number(element.getAttribute('aria-valuenow') ?? 0)
    element.setAttribute('data-e2e-peak', String(level()))
    new MutationObserver(() => {
      if (level() > Number(element.getAttribute('data-e2e-peak'))) element.setAttribute('data-e2e-peak', String(level()))
    }).observe(element, { attributes: true, attributeFilter: ['aria-valuenow'] })
  })
  return async () => Number(await meter.getAttribute('data-e2e-peak'))
}

/** The share of a canvas's pixels that something was drawn on, from 0 (blank) to 1. */
export async function inkOn(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Not a canvas')
    const context = element.getContext('2d')
    if (!context || element.width === 0 || element.height === 0) return 0
    const { data } = context.getImageData(0, 0, element.width, element.height)
    let inked = 0
    for (let alpha = 3; alpha < data.length; alpha += 4) {
      if ((data[alpha] ?? 0) > 0) inked += 1
    }
    return inked / (element.width * element.height)
  })
}
