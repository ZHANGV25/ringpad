import { useCallback, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { Settings } from '../../engine/types'
import { KeyChip } from '../../components/controls'
import { fillBars } from '../../components/draw'
import type { BarRect } from '../../components/draw'
import { reducedMotion } from '../../components/panda/motion'
import { useCanvas } from '../../components/useCanvas'
import { isCalm } from '../../lib/calm'
import { useEngine, useSignals } from '../../state/EngineProvider'

/** The backend sends a new live peak ten times a second. */
const PEAKS_PER_SECOND = 10
const MIN_PEAK = 0.04
const HEIGHT_SHARE = 0.92

interface TapeProps {
  settings: Settings
}

/**
 * The live tape: the last few seconds of what Ringpad hears, gliding left as it records. New data
 * arrives ten times a second; between arrivals the compositor slides the canvas one step, so the
 * tape moves continuously while the page redraws only ten times a second. The highlighted band at
 * the right is exactly what a clip takes, and sits right above the Clip button.
 */
export function Tape({ settings }: TapeProps) {
  const { api } = useEngine()
  const { live } = useSignals()
  const capacity = Math.max(1, Math.round(settings.historySeconds * PEAKS_PER_SECOND))
  const share = Math.min(1, settings.grabSeconds / settings.historySeconds)
  const glider = useRef<HTMLCanvasElement | null>(null)
  const glide = useRef<Animation | null>(null)
  const lastArrival = useRef(0)
  const interval = useRef(1000 / PEAKS_PER_SECOND)
  const pendingGlide = useRef(false)

  const { ref, invalidate } = useCanvas(({ context, width, height, dpr, colors }) => {
    const peaks = live.get()
    // The canvas holds one more slot than shows, the one gliding in from the right.
    const step = width / (capacity + 1)
    const bandStart = width - step - (width - step) * share
    const barWidth = Math.max(1, Math.min(step * 0.55, 2 * dpr))
    const newest = peaks.length - 1
    const old: BarRect[] = []
    const recent: BarRect[] = []
    for (let i = Math.max(0, peaks.length - capacity - 1); i <= newest; i += 1) {
      const slot = capacity - (newest - i)
      const value = Math.max(MIN_PEAK, Math.min(1, peaks[i]))
      const barHeight = Math.max(dpr, value * height * HEIGHT_SHARE)
      const bar = { x: slot * step, y: (height - barHeight) / 2, width: barWidth, height: barHeight }
      // Where the bar ends up after this glide decides its colour.
      if (bar.x - step >= bandStart) recent.push(bar)
      else old.push(bar)
    }
    fillBars(context, old, colors.faint)
    fillBars(context, recent, colors.strong)
    // Restart the glide in the same frame as the redraw, or the tape would twitch back a step.
    restGlide(width / dpr / (capacity + 1), pendingGlide.current)
    pendingGlide.current = false
  })

  /** Rests one step on, so the newest bar shows. A new arrival glides there over the time until
      the next one, starting from where the last glide ended (the redraw moved everything back). */
  const restGlide = (step: number, arrived: boolean) => {
    const canvas = glider.current
    if (!canvas) return
    const rest = `translateX(${(-step).toFixed(2)}px)`
    canvas.style.transform = rest
    if (!arrived) return
    glide.current?.cancel()
    glide.current = null
    if (typeof canvas.animate !== 'function' || isCalm() || reducedMotion()) return
    glide.current = canvas.animate([{ transform: 'translateX(0)' }, { transform: rest }], {
      duration: interval.current,
      easing: 'linear',
    })
  }

  const refCanvas = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      glider.current = canvas
      ref(canvas)
    },
    [ref],
  )

  useEffect(invalidate, [capacity, share, invalidate])

  useEffect(
    () =>
      live.subscribe(() => {
        invalidate()
        const now = performance.now()
        if (lastArrival.current > 0) {
          const gap = Math.min(250, Math.max(40, now - lastArrival.current))
          interval.current = interval.current * 0.8 + gap * 0.2
        }
        lastArrival.current = now
        pendingGlide.current = true
      }),
    [live, invalidate],
  )

  const style = { '--slots': capacity + 1, '--share': share } as CSSProperties
  return (
    <section className="tape" aria-label="Live audio" style={style}>
      <div className="tape-window">
        <canvas ref={refCanvas} className="tape-canvas" role="img" aria-label={`The last ${settings.historySeconds} seconds of audio`} />
        <div className="tape-band" aria-hidden="true" />
      </div>
      <div className="tape-caption">
        <span className="muted small numeric">Last {settings.historySeconds} s</span>
        <button type="button" className="button small clip-button" onClick={() => void api.grabClip()}>
          Clip <span className="clip-button-length numeric">{settings.grabSeconds} s</span> <KeyChip name={settings.hotkeys.grab} />
        </button>
      </div>
    </section>
  )
}
