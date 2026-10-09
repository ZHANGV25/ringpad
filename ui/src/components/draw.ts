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

/** Device-pixel x where the "what a clip takes" band starts, or null without a band. */
export function markerStart(canvasWidth: number, markerSeconds?: number, historySeconds?: number): number | null {
  if (!markerSeconds || !historySeconds) return null
  const share = Math.min(1, markerSeconds / historySeconds)
  return canvasWidth * (1 - share)
}

/**
 * Draws peaks as thin bars in the canvas's text colour. With a marker, bars older than
 * the clip length are drawn muted over a plain background and the newest ones at full
 * contrast over a faint band, so the strip shows what a grab would take.
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  options: { markerSeconds?: number; historySeconds?: number } = {},
): void {
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const width = Math.max(1, Math.floor(rect.width))
  const height = Math.max(1, Math.floor(rect.height))
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  let context: CanvasRenderingContext2D | null = null
  try {
    context = canvas.getContext('2d')
  } catch {
    context = null
  }
  if (!context) {
    return
  }
  const styles = getComputedStyle(canvas)
  const strong = styles.color || '#0b0b0b'
  const muted = styles.getPropertyValue('--text-muted').trim() || strong
  const band = markerStart(canvas.width, options.markerSeconds, options.historySeconds)
  context.clearRect(0, 0, canvas.width, canvas.height)
  if (band !== null) {
    context.fillStyle = styles.getPropertyValue('--surface').trim() || 'transparent'
    context.fillRect(band, 0, canvas.width - band, canvas.height)
  }
  waveformBars(peaks, width, height, dpr).forEach((bar) => {
    context.fillStyle = band === null || bar.x >= band ? strong : muted
    context.fillRect(bar.x, bar.y, bar.width, bar.height)
  })
}
