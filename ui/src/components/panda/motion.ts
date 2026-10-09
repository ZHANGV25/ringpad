import type { MoveName } from './moves'

/** What the panda is doing right now. Each mood's loops live in styles/panda.css. */
export type PandaMood = 'idle' | 'listening' | 'happy' | 'talking' | 'sleeping' | 'confused' | 'celebrate'

/** One-shot moves played on top of the mood. */
export type PandaReaction = MoveName

/** The face each mood wears (tokens for data-face in styles/panda.css). */
export const MOOD_FACE: Record<PandaMood, string> = {
  idle: '',
  listening: '',
  happy: 'happy open',
  talking: 'open',
  sleeping: 'closed',
  confused: 'brow',
  celebrate: 'happy open',
}

interface SpringOptions {
  stiffness: number
  damping: number
}

/** A damped spring from 0 to 1, sampled into a CSS linear() easing, plus how long it takes to settle. */
export function springEasing({ stiffness, damping }: SpringOptions): { easing: string; duration: number } {
  const step = 1 / 120
  const points: number[] = []
  let x = 0
  let v = 0
  let settledFor = 0
  for (let t = 0; t < 3 && settledFor < 0.05; t += step) {
    const a = stiffness * (1 - x) - damping * v
    v += a * step
    x += v * step
    points.push(x)
    settledFor = Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02 ? settledFor + step : 0
  }
  const every = Math.max(1, Math.round(points.length / 40))
  const sampled = points.filter((_, i) => i % every === 0).map((p) => Number(p.toFixed(4)))
  return {
    easing: `linear(0, ${sampled.join(', ')}, 1)`,
    duration: Math.round(points.length * step * 1000),
  }
}

/**
 * Springs by feel: `duration` in seconds and `bounce` from 0 (none) to about 0.4 (playful). The
 * stiffness and damping follow from them: k = (2π/d)², c = 4π(1 − bounce)/d.
 */
export function spring(duration: number, bounce: number): { easing: string; duration: number } {
  return springEasing({ stiffness: (2 * Math.PI / duration) ** 2, damping: (4 * Math.PI * (1 - bounce)) / duration })
}

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** True when the browser can run Web Animations (jsdom cannot). */
export function canAnimate(): boolean {
  return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'
}
