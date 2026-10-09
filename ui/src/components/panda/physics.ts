/** Small, dependency-free motion maths for the panda. */

/**
 * A second-order system (t3ssel8r's "giving personality to procedural animations"): follows a
 * target with natural frequency `f` (Hz), damping `z` (below 1 wobbles) and initial response `r`
 * (below 0 anticipates, above 1 overshoots). Used for follow-through: ears trailing the head.
 */
export class SecondOrder {
  private readonly k1: number
  private readonly k2: number
  private readonly k3: number
  private xp: number
  private y: number
  private yd = 0

  constructor(f: number, z: number, r: number, x0 = 0) {
    this.k1 = z / (Math.PI * f)
    this.k2 = 1 / (2 * Math.PI * f) ** 2
    this.k3 = (r * z) / (2 * Math.PI * f)
    this.xp = x0
    this.y = x0
  }

  /** Advances by `dt` seconds toward `x` and returns the new value. */
  update(dt: number, x: number): number {
    const xd = (x - this.xp) / dt
    this.xp = x
    // Clamping k2 keeps the integration stable for large steps.
    const k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1)
    this.y += dt * this.yd
    this.yd += (dt * (x + this.k3 * xd - this.y - this.k1 * this.yd)) / k2
    return this.y
  }
}

/** A damped wave: starts at 0, swings with amplitude `amp` at `f` Hz and dies out with damping `z`. */
export function wobble(tMs: number, amp: number, f: number, z: number): number {
  const t = tMs / 1000
  return amp * Math.exp(-z * 2 * Math.PI * f * t) * Math.sin(2 * Math.PI * f * t)
}

export type Ease = (t: number) => number

export const linear: Ease = (t) => t
export const easeIn: Ease = (t) => t * t * t
export const easeOut: Ease = (t) => 1 - (1 - t) ** 3
/** Gentler start than easeOut, for fast swings that should not jump in the first frame. */
export const easeOutSoft: Ease = (t) => 1 - (1 - t) ** 2
export const easeInOut: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Values over time: [timeMs, value, ease into this key]. Holds the first and last values outside. */
export type Keys = Array<[number, number, Ease?]>

export function envelope(keys: Keys, tMs: number): number {
  if (tMs <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1, ease = easeInOut] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (tMs <= t1) return v0 + (v1 - v0) * ease((tMs - t0) / Math.max(1, t1 - t0))
  }
  return keys[keys.length - 1][1]
}

/** Log-normal sample with the given median and spread, clamped. Human blink gaps look like this. */
export function logNormal(median: number, sigma: number, min: number, max: number, random = Math.random): number {
  const u = Math.max(1e-9, random())
  const v = random()
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  return Math.min(max, Math.max(min, median * Math.exp(sigma * normal)))
}

/** Picks a key by weight. */
export function weighted<K extends string>(weights: Array<[K, number]>, random = Math.random): K | null {
  const total = weights.reduce((sum, [, w]) => sum + w, 0)
  if (total <= 0) return null
  let pick = random() * total
  for (const [key, w] of weights) {
    pick -= w
    if (pick <= 0) return key
  }
  return weights[weights.length - 1][0]
}
