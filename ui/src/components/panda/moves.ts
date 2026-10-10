import { SecondOrder, easeIn, easeInOut, easeOut, easeOutSoft, envelope, wobble } from './physics'
import type { Keys } from './physics'

/**
 * One-shot moves. Each is a small simulation run once at 120 steps a second and baked into
 * keyframes (see bake), so playing it costs the main thread nothing: the compositor runs it.
 * Numbers come from animation practice: anticipation before a jump, squash on landing, ears and
 * head trailing the body a beat behind, springs that settle instead of stopping dead.
 */

/** Parts a move can drive; each maps to that part's `act` layer in the rig. */
export type Part = 'root' | 'shadow' | 'head' | 'earL' | 'earR' | 'armL' | 'armR' | 'eyes'

/** Offsets in rig units and degrees, applied on top of the mood. */
export interface Pose {
  x: number
  y: number
  r: number
  sx: number
  sy: number
}

export const REST: Pose = { x: 0, y: 0, r: 0, sx: 1, sy: 1 }

export type MoveName =
  | 'hop'
  | 'cheer'
  | 'wiggle'
  | 'nod'
  | 'doubleNod'
  | 'gasp'
  | 'flinch'
  | 'yawn'
  | 'shakeOff'
  | 'lookAround'
  | 'earFlickL'
  | 'earFlickR'
  | 'tilt'
  | 'scratch'
  | 'stretch'
  | 'squish'
  | 'dizzy'
  | 'pout'
  | 'spin'
  | 'wave'

type Poses = Partial<Record<Part, Partial<Pose>>>

export interface FaceKey {
  at: number
  /** Face tokens (see panda.css data-face); null hands the face back to the mood. */
  face: string | null
}

interface Move {
  duration: number
  /** Called in order every 1/120 s with the time in ms and the step in seconds. */
  step: (t: number, dt: number) => Poses
  faces?: FaceKey[]
  blinks?: number[]
}

export interface BakedMove {
  name: MoveName
  duration: number
  /** Frame times in ms, shared by every track; the last is `duration`. */
  times: number[]
  tracks: Partial<Record<Part, Pose[]>>
  faces: FaceKey[]
  blinks: number[]
}

const STEP_MS = 1000 / 120

/** Runs a move's simulation once, keeping every other step: 60 poses a second for each part. */
export function bake(name: MoveName): BakedMove {
  const move = MOVES[name]()
  const times: number[] = []
  const tracks: Partial<Record<Part, Pose[]>> = {}
  const steps = Math.ceil(move.duration / STEP_MS)
  for (let i = 0; i <= steps; i += 1) {
    const t = Math.min(move.duration, i * STEP_MS)
    const poses = move.step(t, STEP_MS / 1000)
    if (i % 2 !== 0 && i !== steps) continue
    for (const [part, pose] of Object.entries(poses) as Array<[Part, Partial<Pose>]>) {
      // A part that joins late holds still until then.
      const track = tracks[part] ?? times.map(() => REST)
      tracks[part] = [...track, { ...REST, ...pose }]
    }
    times.push(t)
    for (const [part, track] of Object.entries(tracks) as Array<[Part, Pose[]]>) {
      if (track.length < times.length) tracks[part] = [...track, REST]
    }
  }
  // Every move ends exactly at rest, so it hands back to the mood without a jump.
  for (const [part, track] of Object.entries(tracks) as Array<[Part, Pose[]]>) {
    tracks[part] = [...track.slice(0, -1), REST]
  }
  return { name, duration: move.duration, times, tracks, faces: move.faces ?? [], blinks: move.blinks ?? [] }
}

/** The pose a baked track holds at `t` ms, interpolated between frames. */
export function sample(baked: BakedMove, part: Part, t: number): Pose {
  const track = baked.tracks[part]
  if (!track || track.length < 2 || t >= baked.duration || t < 0) return REST
  const step = baked.times[1] - baked.times[0] || 1
  const i = Math.min(track.length - 2, Math.floor(t / step))
  const k = Math.min(1, (t - baked.times[i]) / Math.max(1e-6, baked.times[i + 1] - baked.times[i]))
  const a = track[i]
  const b = track[i + 1]
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    r: a.r + (b.r - a.r) * k,
    sx: a.sx + (b.sx - a.sx) * k,
    sy: a.sy + (b.sy - a.sy) * k,
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** A damped spring released from `from` toward `to` at `t0`. */
function settle(t: number, t0: number, from: number, to: number, f: number, z: number): number {
  if (t < t0) return from
  const s = (t - t0) / 1000
  const w = 2 * Math.PI * f
  return to + (from - to) * Math.exp(-z * w * s) * Math.cos(w * Math.sqrt(1 - z * z) * s)
}

function sum(a: Partial<Pose> = {}, b: Partial<Pose> = {}): Partial<Pose> {
  return {
    x: (a.x ?? 0) + (b.x ?? 0),
    y: (a.y ?? 0) + (b.y ?? 0),
    r: (a.r ?? 0) + (b.r ?? 0),
    sx: (a.sx ?? 1) * (b.sx ?? 1),
    sy: (a.sy ?? 1) * (b.sy ?? 1),
  }
}

/**
 * Follow-through for moves that drive the root: the head trails the body through a spring (capped
 * so it never comes apart), the ears flop with the vertical acceleration, and the shadow shrinks
 * as the panda leaves the ground.
 */
function follow(root: (t: number) => Partial<Pose>, extra?: (t: number) => Poses, lag = true): Move['step'] {
  const headY = new SecondOrder(4, 0.6, 0)
  const headR = new SecondOrder(4, 0.6, 0)
  const earL = new SecondOrder(2.8, 0.35, 0)
  const earR = new SecondOrder(2.8, 0.35, 0)
  let lastY = 0
  let lastV = 0
  return (t, dt) => {
    const body = { ...REST, ...root(t) }
    const lagY = lag ? clamp(headY.update(dt, body.y) - body.y, -3, 3) : 0
    const lagR = lag ? clamp(headR.update(dt, body.r) - body.r, -6, 6) : 0
    const v = (body.y - lastY) / dt
    const accel = (v - lastV) / dt
    lastY = body.y
    lastV = v
    const flop = lag ? clamp(accel * 0.014, -15, 15) : 0
    const more = extra?.(t) ?? {}
    const lift = clamp(-body.y / 14, 0, 1)
    return {
      ...more,
      root: body,
      head: sum({ y: lagY, r: lagR }, more.head),
      earL: { r: earL.update(dt, flop) + (more.earL?.r ?? 0) },
      earR: { r: earR.update(dt, -flop) + (more.earR?.r ?? 0) },
      shadow: { sx: 1 - 0.3 * lift, sy: 1 - 0.3 * lift },
    }
  }
}

/** One hop: crouch, stretch on the way up, land with a squash, settle. `height` in rig units. */
function hopAt(t: number, start: number, height: number): Partial<Pose> {
  const k = t - start
  if (k < 0) return {}
  const squash = 0.1 * Math.min(1, height / 12)
  const y = envelope(
    [
      [0, 0],
      [120, 2 * (height / 12), easeIn],
      [310, -height, easeOut],
      [440, 0, easeIn],
    ],
    k,
  )
  const sy =
    k < 460
      ? envelope(
          [
            [0, 1],
            [120, 1 - squash, easeIn],
            [200, 1 + squash, easeOut],
            [320, 1],
            [420, 1.03],
            [460, 1 - squash * 0.8, easeOut],
          ],
          k,
        )
      : settle(k, 460, 1 - squash * 0.8, 1, 4, 0.45)
  return { y, sy, sx: 1 / sy }
}

/** Saccades: the eyes jump to each target in 50 ms and hold there. */
function gaze(targets: Array<{ at: number; x: number; y: number }>) {
  return (t: number): Partial<Pose> => {
    let from = { x: 0, y: 0 }
    for (const target of targets) {
      if (t < target.at) break
      const k = easeOut(Math.min(1, (t - target.at) / 50))
      from = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k }
    }
    return from
  }
}

/** Arms up with a little overshoot, a happy shake while up, then down. */
function armsUp(t: number, upAt: number, downAt: number): Poses {
  if (t < upAt) return {}
  const up = envelope(
    [
      [upAt, 0],
      [upAt + 200, 165, easeOutSoft],
      [upAt + 300, 150, easeInOut],
      [downAt, 150],
      [downAt + 250, 0, easeInOut],
    ],
    t,
  )
  // A happy shake while the arms are up, faded in and out so it never starts with a jolt.
  const from = upAt + 300
  const fade = envelope([[from, 0], [from + 100, 1], [downAt - 100, 1], [downAt, 0]], t)
  const shake = t > from && t < downAt ? 5 * fade * Math.sin(((t - from) / 1000) * 2 * Math.PI * 6) : 0
  return { armL: { r: up + shake }, armR: { r: -(up + shake) } }
}

const WAVE_MS = 1900
/** Hello: the right paw swings up past the head, waves from the shoulder, and drops back. */
function waveStep(t: number): Poses {
  const up = envelope([[0, 0], [300, 182, easeOutSoft], [1480, 182], [1820, 0, easeInOut]], t)
  // The waving fades in and out so the paw never starts or stops with a jolt.
  const fade = envelope([[280, 0], [400, 1], [1320, 1], [1480, 0]], t)
  const swing = t > 280 && t < 1480 ? 16 * fade * Math.sin(((t - 280) / 1000) * 2 * Math.PI * 2.4) : 0
  // The head leans toward the paw and the body follows a touch.
  const lean = envelope([[0, 0], [320, 1, easeOut], [1480, 1], [1820, 0, easeInOut]], t)
  return { armR: { r: -(up + swing) }, head: { r: 6 * lean }, root: { r: 1.5 * lean } }
}

/** Snaps toward `peak` in `attack` ms, then springs back to 0. */
function kick(t: number, peak: number, attack: number, f = 3.5, z = 0.5): number {
  return t < attack ? envelope([[0, 0], [attack, peak, easeOut]], t) : settle(t, attack, peak, 0, f, z)
}

const hold = (keys: Keys) => (t: number) => envelope(keys, t)

const MOVES: Record<MoveName, () => Move> = {
  hop: () => ({ duration: 820, step: follow((t) => hopAt(t, 0, 12)) }),

  cheer: () => ({
    duration: 1620,
    step: follow(
      (t) => sum(sum(hopAt(t, 0, 18), hopAt(t, 820, 6)), hopAt(t, 1160, 4)),
      (t) => armsUp(t, 40, 1150),
    ),
    faces: [
      { at: 0, face: 'happy open' },
      { at: 1400, face: null },
    ],
  }),

  wave: () => ({ duration: WAVE_MS, step: waveStep, faces: [{ at: 0, face: 'happy open' }, { at: WAVE_MS - 260, face: null }] }),

  wiggle: () => ({
    duration: 600,
    step: (t) => {
      const ear = t > 50 ? 1.6 * wobble(t - 50, 6, 7, 0.25) : 0
      return { root: { r: wobble(t, 6, 7, 0.25) }, earL: { r: ear }, earR: { r: ear } }
    },
    faces: [
      { at: 0, face: 'happy' },
      { at: 520, face: null },
    ],
  }),

  nod: () => nod(1),
  doubleNod: () => nod(2),

  // Surprise has no anticipation: everything snaps open at once, then settles.
  gasp: () => ({
    duration: 640,
    step: follow(
      (t) => {
        const sy = t < 220 ? envelope([[0, 1], [70, 1.05, easeOut]], t) : settle(t, 220, 1.05, 1, 3.5, 0.5)
        const y = t < 220 ? envelope([[0, 0], [70, -3, easeOut]], t) : settle(t, 220, -3, 0, 3.5, 0.5)
        return { y, sy, sx: 1 / sy }
      },
      (t) => {
        const back = t < 220 ? envelope([[0, 0], [70, 10, easeOut]], t) : settle(t, 220, 10, 0, 3.5, 0.5)
        return { earL: { r: -back }, earR: { r: back }, eyes: { y: -0.08 * back } }
      },
      false,
    ),
    faces: [
      { at: 0, face: 'open' },
      { at: 420, face: null },
    ],
  }),

  flinch: () => ({
    duration: 440,
    step: (t) => {
      const sy = t < 60 ? envelope([[0, 1], [60, 0.94, easeOut]], t) : settle(t, 60, 0.94, 1, 4, 0.5)
      return { root: { sy, sx: 1 / sy }, head: { r: kick(t, -4, 60, 4, 0.5) } }
    },
    faces: [
      { at: 0, face: 'closed' },
      { at: 220, face: null },
    ],
  }),

  // Reach back, open wide with a little tremor, then slump: hands over to sleeping.
  yawn: () => {
    const arms = hold([
      [0, 0],
      [500, 30],
      [1100, 30],
      [1500, 0],
    ])
    const stretch = hold([
      [0, 1],
      [500, 1.04],
      [1100, 1.04],
      [1350, 0.97],
      [1500, 1],
    ])
    const head = hold([
      [0, 0],
      [500, -5],
      [1100, -5],
      [1500, 0],
    ])
    return {
      duration: 1500,
      step: (t) => {
        const tremor = t > 500 && t < 1100 ? 0.8 * Math.sin(((t - 500) / 1000) * 2 * Math.PI * 9) : 0
        const sy = stretch(t)
        return {
          root: { sy, sx: 1 / sy },
          head: { r: head(t) + tremor },
          armL: { r: arms(t) },
          armR: { r: -arms(t) },
        }
      },
      faces: [
        { at: 460, face: 'closed open' },
        { at: 1100, face: 'closed' },
        { at: 1480, face: null },
      ],
    }
  },

  // Waking up: a double blink, a shake like a wet dog with the ears whipping behind, a small hop.
  shakeOff: () => ({
    duration: 1000,
    step: follow(
      (t) => sum({ r: t < 660 ? wobble(t, 9, 5.5, 0.18) : 0 }, hopAt(t, 640, 4)),
      (t) => {
        const ears = t > 40 && t < 680 ? wobble(t - 40, 15, 5.5, 0.18) : 0
        return {
          head: { r: t > 60 && t < 700 ? -0.6 * wobble(t - 60, 9, 5.5, 0.18) : 0 },
          earL: { r: ears },
          earR: { r: ears },
        }
      },
    ),
    blinks: [0, 170],
  }),

  // The eyes lead and the head follows a beat later.
  lookAround: () => {
    const eyes = gaze([
      { at: 0, x: -2.4, y: -0.4 },
      { at: 820, x: 2.4, y: -0.2 },
      { at: 1700, x: 0, y: 0 },
    ])
    const head = hold([
      [120, 0],
      [420, -3],
      [940, -3],
      [1240, 3],
      [1760, 3],
      [2050, 0],
    ])
    return {
      duration: 2100,
      step: (t) => {
        const r = head(t)
        return { eyes: eyes(t), head: { r, x: r * 0.4 }, earL: { r: r * -0.6 }, earR: { r: r * -0.6 } }
      },
      blinks: [0, 820],
    }
  },

  earFlickL: () => earFlick('earL', -1),
  earFlickR: () => earFlick('earR', 1),

  tilt: () => {
    const r = hold([
      [0, 0],
      [260, 7, easeOut],
      [1000, 7],
      [1350, 0],
    ])
    return { duration: 1400, step: (t) => ({ head: { r: r(t) }, earL: { r: -r(t) * 0.4 }, earR: { r: -r(t) * 0.4 } }) }
  },

  scratch: () => {
    const lift = hold([
      [0, 0],
      [200, -38],
      [850, -38],
      [1100, 0],
    ])
    const tip = hold([
      [0, 0],
      [250, 4],
      [850, 4],
      [1100, 0],
    ])
    return {
      duration: 1100,
      step: (t) => ({
        armR: { r: lift(t) + (t > 200 && t < 850 ? 8 * Math.sin(((t - 200) / 1000) * 2 * Math.PI * 8) : 0) },
        head: { r: tip(t) },
      }),
      faces: [
        { at: 250, face: 'happy' },
        { at: 850, face: null },
      ],
    }
  },

  stretch: () => {
    const stretch = hold([
      [0, 1],
      [500, 1.06],
      [900, 1.06],
      [1300, 1],
    ])
    const arms = hold([
      [0, 0],
      [500, 40],
      [900, 40],
      [1300, 0],
    ])
    const head = hold([
      [0, 0],
      [500, -3],
      [900, -3],
      [1300, 0],
    ])
    return {
      duration: 1400,
      step: (t) => {
        const sy = stretch(t)
        return { root: { sy, sx: 1 / sy }, armL: { r: arms(t) }, armR: { r: -arms(t) }, head: { r: head(t) } }
      },
      faces: [
        { at: 400, face: 'closed' },
        { at: 1000, face: null },
      ],
    }
  },

  squish: () => ({
    duration: 460,
    step: follow((t) => {
      const sy = t < 80 ? envelope([[0, 1], [80, 0.92, easeOut]], t) : settle(t, 80, 0.92, 1, 4.5, 0.35)
      return { sy, sx: 1 / sy }
    }),
    faces: [
      { at: 0, face: 'happy' },
      { at: 420, face: null },
    ],
  }),

  dizzy: () => ({
    duration: 1100,
    step: (t) => {
      const turn = Math.min(1, t / 900) * 2 * Math.PI * 1.5
      const on = t < 900 ? 1 : 0
      return {
        root: { r: on * 2.5 * Math.sin((t / 1000) * 2 * Math.PI * 2) * (1 - t / 900) },
        eyes: { x: 2.4 * Math.cos(turn) * on * (1 - t / 900), y: 2.4 * Math.sin(turn) * on * (1 - t / 900) },
      }
    },
  }),

  // Five pokes: turns away in a huff with a frown, then forgives.
  pout: () => {
    const away = hold([
      [0, 0],
      [250, 1, easeOut],
      [3700, 1],
      [4000, 0],
    ])
    const eyes = gaze([
      { at: 120, x: -2.6, y: 0.4 },
      { at: 3750, x: 0, y: 0 },
    ])
    return {
      duration: 4000,
      step: (t) => {
        const a = away(t)
        return { head: { r: -8 * a, y: 2 * a }, earL: { r: -14 * a }, earR: { r: 14 * a }, eyes: eyes(t) }
      },
      faces: [
        { at: 0, face: 'brow' },
        { at: 3800, face: null },
      ],
    }
  },

  // The easter egg: a full turn in the air around the belly rather than the feet.
  spin: () => ({
    duration: 1200,
    step: follow(
      (t) => {
        const turn = envelope([[100, 0], [900, 360, easeInOut]], t)
        const rad = (turn * Math.PI) / 180
        const lift = hopAt(t, 60, 22)
        return { ...lift, r: turn, x: -72 * Math.sin(rad), y: (lift.y ?? 0) - 72 + 72 * Math.cos(rad) }
      },
      undefined,
      false,
    ),
    faces: [
      { at: 0, face: 'happy open' },
      { at: 1100, face: null },
    ],
  }),
}

function nod(count: number): Move {
  const one: Keys = [
    [0, 0],
    [140, 7, easeOut],
    [300, -2, easeInOut],
    [440, 0, easeOut],
  ]
  const keys: Keys = count === 2 ? [...one, [580, 5, easeOut], [720, -1, easeInOut], [860, 0, easeOut]] : one
  const ears = new SecondOrder(2.8, 0.35, 0)
  return {
    duration: count === 2 ? 1000 : 640,
    step: (t, dt) => {
      const r = envelope(keys, t)
      const trail = ears.update(dt, r) - r
      return { head: { r, y: r * 0.3 }, earL: { r: trail }, earR: { r: -trail } }
    },
  }
}

function earFlick(part: 'earL' | 'earR', sign: number): Move {
  return { duration: 560, step: (t) => ({ [part]: { r: sign * kick(t, 12, 60, 4.5, 0.3) } }) }
}

export const ALL_MOVES = Object.keys(MOVES) as MoveName[]

/** Turns a pose into a transform. Every keyframe uses the same function list, so the browser
    interpolates each number on its own: no matrix decomposition, no flip halfway through a spin. */
export function poseToTransform(pose: Pose, u: number): string {
  const x = (pose.x * u).toFixed(3)
  const y = (pose.y * u).toFixed(3)
  return `translate(${x}px, ${y}px) rotate(${pose.r.toFixed(3)}deg) scale(${pose.sx.toFixed(4)}, ${pose.sy.toFixed(4)})`
}
