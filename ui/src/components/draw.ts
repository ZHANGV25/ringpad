export interface BarRect {
  x: number
  y: number
  width: number
  height: number
}

/** CSS pixels from one bar to the next (1 px bar, 1 px gap). */
const BAR_STEP = 2
const MIN_PEAK = 0.03
const HEIGHT_SHARE = 0.9

/** Resamples peaks to exactly `count` values, keeping the loudest value of each bucket. */
export function fitPeaks(peaks: number[], count: number): number[] {
  if (count <= 0 || peaks.length === 0) return []
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * peaks.length) / count)
    const end = Math.max(start + 1, Math.floor(((index + 1) * peaks.length) / count))
    return Math.max(...peaks.slice(start, end))
  })
}

/** Bar rectangles in device pixels that span the whole width, mirrored around the centre. */
export function waveformBars(peaks: number[], width: number, height: number, dpr: number): BarRect[] {
  const step = BAR_STEP * dpr
  const count = Math.max(1, Math.floor((width * dpr) / step))
  const center = (height * dpr) / 2
  return fitPeaks(peaks, count).map((peak, index) => {
    const value = Math.max(MIN_PEAK, Math.min(1, peak))
    const barHeight = Math.max(1, value * height * dpr * HEIGHT_SHARE)
    return {
      x: index * step,
      y: center - barHeight / 2,
      width: Math.max(1, dpr),
      height: barHeight,
    }
  })
}

/** Fills every bar as one path: one draw call per colour instead of one per bar. */
export function fillBars(context: CanvasRenderingContext2D, bars: BarRect[], color: string): void {
  if (bars.length === 0) return
  context.beginPath()
  for (const bar of bars) context.rect(bar.x, bar.y, bar.width, bar.height)
  context.fillStyle = color
  context.fill()
}
