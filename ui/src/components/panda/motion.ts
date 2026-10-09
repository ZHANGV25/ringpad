/** What the panda is doing right now. Loops for each mood live in styles/panda.css. */
export type PandaMood = 'idle' | 'listening' | 'happy' | 'talking' | 'sleeping' | 'confused' | 'celebrate'

/** One-shot moves played on top of the mood. */
export type PandaReaction = 'hop' | 'cheer' | 'wiggle' | 'nod'

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

/** A critically damped follower used to smooth the talking mouth between meter updates. */
export function createFollower(stiffness = 420): (target: number, dt: number) => number {
  const damping = 2 * Math.sqrt(stiffness)
  let value = 0
  let velocity = 0
  return (target, dt) => {
    const clamped = Math.min(dt, 1 / 20)
    const accel = stiffness * (target - value) - damping * velocity
    velocity += accel * clamped
    value += velocity * clamped
    return value
  }
}

export function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function canAnimate(el: Element | null): el is Element & { animate: Element['animate'] } {
  return el !== null && typeof el.animate === 'function' && !reducedMotion()
}

function play(root: ParentNode, selector: string, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
  root.querySelectorAll(selector).forEach((el) => {
    // 'add' layers the move on top of the breathing loop instead of replacing it, so nothing jumps.
    if (canAnimate(el)) el.animate(keyframes, { composite: 'add', ...options })
  })
}

const BOUNCE = 'cubic-bezier(.3,.7,.4,1)'

const HOP: Keyframe[] = [
  { transform: 'translateY(0) scale(1, 1)' },
  { transform: 'translateY(0) scale(1.08, .9)', offset: 0.16 },
  { transform: 'translateY(-18px) scale(.95, 1.07)', offset: 0.45 },
  { transform: 'translateY(0) scale(1.06, .93)', offset: 0.78 },
  { transform: 'translateY(0) scale(1, 1)' },
]

const HOP_SHADOW: Keyframe[] = [
  { transform: 'scale(1)', opacity: 1 },
  { transform: 'scale(.72)', opacity: 0.5, offset: 0.45 },
  { transform: 'scale(1)', opacity: 1 },
]

/** Plays a one-shot move on a rendered panda. Does nothing when motion is reduced. */
export function playReaction(svg: SVGSVGElement, kind: PandaReaction): void {
  if (kind === 'hop' || kind === 'cheer') {
    const iterations = kind === 'cheer' ? 2 : 1
    play(svg, '.pd-root', HOP, { duration: 560, easing: BOUNCE, iterations })
    play(svg, '.pd-shadow', HOP_SHADOW, { duration: 560, easing: BOUNCE, iterations })
  }
  if (kind === 'cheer') {
    const up = (deg: number): Keyframe[] => [
      { transform: 'rotate(0)' },
      { transform: `rotate(${deg}deg)`, offset: 0.3 },
      { transform: `rotate(${deg}deg)`, offset: 0.75 },
      { transform: 'rotate(0)' },
    ]
    play(svg, '.pd-arm-l', up(150), { duration: 1120, easing: 'ease-in-out' })
    play(svg, '.pd-arm-r', up(-150), { duration: 1120, easing: 'ease-in-out' })
  }
  if (kind === 'wiggle') {
    const turns = [0, -7, 6, -4, 2, 0].map((deg) => ({ transform: `rotate(${deg}deg)` }))
    play(svg, '.pd-root', turns, { duration: 520, easing: 'ease-in-out' })
  }
  if (kind === 'nod') {
    const nod = [
      { transform: 'translateY(0) rotate(0)' },
      { transform: 'translateY(3px) rotate(3deg)', offset: 0.4 },
      { transform: 'translateY(0) rotate(0)' },
    ]
    play(svg, '.pd-head', nod, { duration: 380, easing: 'ease-in-out' })
  }
}

/** Parts whose pose differs between moods (a tilted head, a hop, raised arms). */
const POSED_PARTS = ['.pd-root', '.pd-body', '.pd-head', '.pd-shadow', '.pd-arm-l', '.pd-arm-r']
const IDENTITY = 'matrix(1, 0, 0, 1, 0, 0)'

function canBridge(): boolean {
  return typeof DOMMatrix === 'function' && typeof window.getComputedStyle === 'function' && !reducedMotion()
}

function toMatrix(transform: string): DOMMatrix {
  return transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix()
}

function isIdentity(m: DOMMatrix): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001
  return near(m.a, 1) && near(m.b, 0) && near(m.c, 0) && near(m.d, 1) && near(m.e, 0) && near(m.f, 0)
}

/**
 * Switches mood without a jump. Every posed part is measured before and after the switch, then a
 * spring carries it from where it was into the new mood's loop. With composite 'add' the result is
 * after · offset, so offset = after⁻¹ · before makes the first frame match the old pose exactly.
 */
export function changeMood(svg: SVGSVGElement, mood: PandaMood): void {
  const parts = canBridge() ? POSED_PARTS.flatMap((selector) => Array.from(svg.querySelectorAll(selector))) : []
  const before = parts.map((el) => window.getComputedStyle(el).transform)
  svg.dataset.mood = mood
  const settle = springEasing({ stiffness: 240, damping: 26 })
  parts.forEach((el, index) => {
    const offset = toMatrix(window.getComputedStyle(el).transform).inverse().multiply(toMatrix(before[index]))
    if (isIdentity(offset) || !canAnimate(el)) return
    el.animate([{ transform: offset.toString() }, { transform: IDENTITY }], {
      composite: 'add',
      duration: settle.duration,
      easing: settle.easing,
    })
  })
  playMoodChange(svg)
}

/** A quick blink and a springy pop that hide the switch from one expression to the next. */
export function playMoodChange(svg: SVGSVGElement): void {
  const pop = springEasing({ stiffness: 260, damping: 14 })
  play(svg, '.pd-eyes-open, .pd-eyes-happy, .pd-eyes-closed', [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.15)', offset: 0.45 }, { transform: 'scaleY(1)' }], {
    duration: 190,
    easing: 'ease-in-out',
  })
  play(svg, '.pd-head', [{ transform: 'scale(.96)' }, { transform: 'scale(1)' }], {
    duration: pop.duration,
    easing: pop.easing,
  })
}
