import { fillBars, waveformBars } from '../components/draw'
import { reducedMotion, spring } from '../components/panda/motion'
import { palette } from './palette'

const FLIGHT = spring(0.46, 0.16)

/**
 * Flies a waveform from one box to another, so you see where things go: the clip lifts out of the
 * tape, a saved clip drops into its pad. The flying copy is drawn at the destination's size and
 * starts scaled down to the source box, so it is crisp where it lands. It is a fixed-position
 * layer moved only by transform, so the flight runs on the compositor.
 *
 * Returns how long the flight takes (0 when it does not fly), so the destination can fade in.
 */
export function flyWaveform(peaks: number[], from: DOMRect, to: DOMRect): number {
  if (reducedMotion() || from.width < 1 || to.width < 1 || typeof Element.prototype.animate !== 'function') return 0
  const dpr = window.devicePixelRatio || 1
  const ghost = document.createElement('canvas')
  ghost.width = Math.round(to.width * dpr)
  ghost.height = Math.round(to.height * dpr)
  const context = ghost.getContext('2d')
  if (!context) return 0
  fillBars(context, waveformBars(peaks, to.width, to.height, dpr), palette().strong)
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${to.left}px`,
    top: `${to.top}px`,
    width: `${to.width}px`,
    height: `${to.height}px`,
    transformOrigin: '0 0',
    pointerEvents: 'none',
    zIndex: '50',
  })
  ghost.setAttribute('aria-hidden', 'true')
  document.body.append(ghost)
  const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
  // The spring may overshoot, so the fade at the end is a separate, linear animation.
  const flight = ghost.animate([{ transform: start }, { transform: 'none' }], { duration: FLIGHT.duration, easing: FLIGHT.easing })
  ghost.animate([{ opacity: 0.9 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: FLIGHT.duration })
  const done = () => ghost.remove()
  flight.onfinish = done
  flight.oncancel = done
  return FLIGHT.duration
}

/** Keeps `el` hidden while something flies to it, then fades it in as the flight lands. */
export function landHere(el: Element, duration: number): void {
  if (duration <= 0 || typeof el.animate !== 'function') return
  el.animate([{ opacity: 0 }, { opacity: 0, offset: 0.8 }, { opacity: 1 }], { duration })
}
