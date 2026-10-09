import { MOOD_FACE, canAnimate, reducedMotion, spring } from './motion'
import type { PandaMood } from './motion'
import { REST, bake, poseToTransform, sample } from './moves'
import type { BakedMove, MoveName, Part, Pose } from './moves'

/** The layer each part's one-shot moves drive (see PandaArt). */
const ACT: Record<Part, string> = {
  root: '.rt-act',
  shadow: '.sh-act',
  head: '.hd-act',
  earL: '.el-act',
  earR: '.er-act',
  armL: '.al-act',
  armR: '.ar-act',
  eyes: '.look-act',
}

/** Each mood loop and the layer under it that hides the jump when the loop changes. */
const SETTLE: Array<[string, string]> = [
  ['.rt-mood', '.rt-settle'],
  ['.bd-mood', '.bd-settle'],
  ['.hd-mood', '.hd-settle'],
  ['.al-mood', '.al-settle'],
  ['.ar-mood', '.ar-settle'],
]

const IDENTITY = 'matrix(1, 0, 0, 1, 0, 0)'
const SETTLE_SPRING = spring(0.45, 0.15)
/** Close in 70 ms (accelerating), hold 40 ms, open in 130 ms (decelerating). */
const BLINK_MS = 240
const BLINK: Keyframe[] = [
  { transform: 'scaleY(1)', easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  { transform: 'scaleY(0.1)', offset: 70 / BLINK_MS },
  { transform: 'scaleY(0.1)', offset: 110 / BLINK_MS, easing: 'cubic-bezier(0, 0.55, 0.45, 1)' },
  { transform: 'scaleY(1)' },
]
/** How fast an interrupted move's leftover pose fades into the new one (rad/s, critically damped). */
const HANDOFF_W = 2 * Math.PI * 3.2
/** Pupils sit inside the white of the eye, so they can travel this far from centre (rig units). */
export const MAX_LOOK = 3.2

const cache = new Map<MoveName, BakedMove>()

function baked(name: MoveName): BakedMove {
  const hit = cache.get(name)
  if (hit) return hit
  const fresh = bake(name)
  cache.set(name, fresh)
  return fresh
}

function toMatrix(transform: string): DOMMatrix {
  return transform && transform !== 'none' ? new DOMMatrix(transform) : new DOMMatrix()
}

function isIdentity(m: DOMMatrix): boolean {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001
  return near(m.a, 1) && near(m.b, 0) && near(m.c, 0) && near(m.d, 1) && near(m.e, 0) && near(m.f, 0)
}

function eyesOf(face: string): string {
  if (face.includes('closed')) return 'closed'
  return face.includes('happy') ? 'happy' : 'open'
}

/** Adds what is left of an interrupted move, fading out like a critically damped spring. */
function handOff(pose: Pose, left: Pose | undefined, t: number): Pose {
  if (!left) return pose
  const s = t / 1000
  const k = (1 + HANDOFF_W * s) * Math.exp(-HANDOFF_W * s)
  return {
    x: pose.x + left.x * k,
    y: pose.y + left.y * k,
    r: pose.r + left.r * k,
    sx: pose.sx * (1 + (left.sx - 1) * k),
    sy: pose.sy * (1 + (left.sy - 1) * k),
  }
}

interface Playing {
  move: BakedMove
  start: number
  animations: Animation[]
}

/**
 * Drives one rendered panda: mood changes without jumps, blinks, one-shot moves that hand over to
 * each other mid-flight, where the eyes look and the talking mouth. Everything it starts runs on
 * the compositor; it only touches the DOM when something changes.
 */
export class Rig {
  private readonly root: HTMLElement
  private mood: PandaMood
  private unit: number
  private override: string | null = null
  private playing: Playing | null = null
  private settling: Animation[] = []
  private moveTimers: number[] = []
  private blinkUntil = 0
  private talking: { mouth: HTMLElement | null; head: HTMLElement | null; shown: string } | null = null

  constructor(root: HTMLElement, mood: PandaMood, unit: number) {
    this.root = root
    this.mood = mood
    this.unit = unit
    root.dataset.mood = mood
    root.dataset.face = MOOD_FACE[mood]
  }

  setUnit(unit: number): void {
    this.unit = unit
  }

  get currentMood(): PandaMood {
    return this.mood
  }

  /** Whether a one-shot move is still running. */
  busy(): boolean {
    return this.playing !== null && performance.now() - this.playing.start < this.playing.move.duration
  }

  /**
   * Switches mood. Poses glide there by CSS transition; loops would jump, so each loop layer is
   * measured before and after and a spring on the layer beneath carries the old pose into the new
   * loop: with after · s = before, s starts at after⁻¹ · before and springs to nothing.
   */
  setMood(mood: PandaMood): void {
    if (mood === this.mood) return
    const face = this.face()
    const layers = this.canMove() && typeof DOMMatrix === 'function' ? this.layers() : []
    const before = layers.map(([loop, settle]) => toMatrix(getComputedStyle(loop).transform).multiply(toMatrix(getComputedStyle(settle).transform)))
    this.mood = mood
    this.root.dataset.mood = mood
    const starts = layers.map(([loop], i) => toMatrix(getComputedStyle(loop).transform).inverse().multiply(before[i]))
    this.settling.forEach((animation) => animation.cancel())
    this.settling = layers.flatMap(([, settle], i) =>
      isIdentity(starts[i])
        ? []
        : [
            settle.animate([{ transform: starts[i].toString() }, { transform: IDENTITY }], {
              duration: SETTLE_SPRING.duration,
              easing: SETTLE_SPRING.easing,
            }),
          ],
    )
    this.showFace(face)
  }

  /** Blinks once, or twice in quick succession. Never starts a blink while one is running. */
  blink(double = false): void {
    if (!this.canMove() || eyesOf(this.face()) !== 'open') return
    const now = performance.now()
    if (now < this.blinkUntil) return
    const gap = 120 + Math.random() * 60
    const total = double ? BLINK_MS * 2 + gap : BLINK_MS
    const frames = double ? doubleBlink(gap) : BLINK
    this.blinkUntil = now + total
    this.root.querySelectorAll('.yl-blink, .yr-blink').forEach((eye) => eye.animate(frames, { duration: total }))
  }

  /** Plays a one-shot move. A move already running hands its pose over instead of snapping back. */
  play(name: MoveName): void {
    const move = baked(name)
    this.clearMoveTimers()
    this.override = null
    if (!this.canMove()) {
      this.scheduleFaces(move)
      return
    }
    const now = performance.now()
    const left = this.leftover(now)
    this.playing?.animations.forEach((animation) => animation.cancel())
    const parts = new Set([...Object.keys(move.tracks), ...Object.keys(left)] as Part[])
    const animations: Animation[] = []
    parts.forEach((part) => {
      const track = move.tracks[part]
      const last = move.times.length - 1
      const frames = move.times.map((t, i) => ({
        offset: t / move.duration,
        transform: poseToTransform(i === last ? REST : handOff(track?.[i] ?? REST, left[part], t), this.unit),
      }))
      this.root.querySelectorAll(ACT[part]).forEach((el) => {
        animations.push(el.animate(frames, { duration: move.duration, easing: 'linear' }))
      })
    })
    this.playing = { move, start: now, animations }
    this.scheduleFaces(move)
    move.blinks.forEach((at) => this.later(at, () => this.blink()))
  }

  /** Points the pupils (rig units, up to MAX_LOOK); the head turns a little after them. */
  lookAt(x: number, y: number): void {
    const u = this.unit
    const pupils = `translate(${(x * u).toFixed(2)}px, ${(y * u).toFixed(2)}px)`
    this.root.querySelectorAll<HTMLElement>('.look').forEach((el) => {
      el.style.transform = pupils
    })
    const head = this.root.querySelector<HTMLElement>('.hd-look')
    if (head) head.style.transform = `translate(${(x * 0.45 * u).toFixed(2)}px, ${(y * 0.3 * u).toFixed(2)}px) rotate(${(x * 0.6).toFixed(2)}deg)`
  }

  /**
   * The talking mouth (0 shut to 1 wide) and a small head bob (degrees). While talking both are
   * their own layers, so a frame moves two layers on the compositor and repaints nothing; a frame
   * that changes nothing writes nothing.
   */
  talk(open: number, nod: number): void {
    if (!this.talking) {
      const mouth = this.root.querySelector<HTMLElement>('.mo-talk')
      const head = this.root.querySelector<HTMLElement>('.hd-talk')
      mouth?.style.setProperty('will-change', 'transform')
      head?.style.setProperty('will-change', 'transform')
      this.talking = { mouth, head, shown: '' }
    }
    const mouth = `scaleY(${(0.25 + open * 0.85).toFixed(3)})`
    const head = `translateY(${(-open * 2.2 * this.unit).toFixed(2)}px) rotate(${nod.toFixed(2)}deg)`
    const shown = mouth + head
    if (shown === this.talking.shown) return
    this.talking.shown = shown
    if (this.talking.mouth) this.talking.mouth.style.transform = mouth
    if (this.talking.head) this.talking.head.style.transform = head
  }

  /** Deep sleep stops every loop (see panda.css), so a sleeping panda draws nothing. */
  setDeep(deep: boolean): void {
    if (deep) this.root.dataset.deep = ''
    else delete this.root.dataset.deep
  }

  stopTalking(): void {
    for (const part of [this.talking?.mouth, this.talking?.head]) {
      part?.style.removeProperty('transform')
      part?.style.removeProperty('will-change')
    }
    this.talking = null
  }

  dispose(): void {
    this.clearMoveTimers()
    this.playing?.animations.forEach((animation) => animation.cancel())
    this.settling.forEach((animation) => animation.cancel())
    this.playing = null
    this.settling = []
  }

  private canMove(): boolean {
    return canAnimate() && !reducedMotion()
  }

  private face(): string {
    return this.override ?? MOOD_FACE[this.mood]
  }

  /** Writes the face, blinking across the swap when the eyes change (the CSS swap lands mid-blink). */
  private showFace(previous: string): void {
    const next = this.face()
    this.root.dataset.face = next
    if (eyesOf(previous) !== eyesOf(next) && eyesOf(previous) === 'open') this.blinkThrough()
  }

  private blinkThrough(): void {
    if (!this.canMove()) return
    this.blinkUntil = performance.now() + BLINK_MS
    this.root.querySelectorAll('.yl-blink, .yr-blink').forEach((eye) => eye.animate(BLINK, { duration: BLINK_MS }))
  }

  private scheduleFaces(move: BakedMove): void {
    move.faces.forEach(({ at, face }) =>
      this.later(at, () => {
        const previous = this.face()
        this.override = face
        this.showFace(previous)
      }),
    )
    // Whatever happens, the mood gets its face back when the move ends.
    this.later(move.duration, () => {
      if (this.override === null) return
      const previous = this.face()
      this.override = null
      this.showFace(previous)
    })
  }

  private leftover(now: number): Partial<Record<Part, Pose>> {
    const playing = this.playing
    if (!playing) return {}
    const t = now - playing.start
    if (t >= playing.move.duration) return {}
    const left: Partial<Record<Part, Pose>> = {}
    for (const part of Object.keys(playing.move.tracks) as Part[]) left[part] = sample(playing.move, part, t)
    return left
  }

  private layers(): Array<[Element, Element]> {
    return SETTLE.flatMap(([loop, settle]) => {
      const a = this.root.querySelector(loop)
      const b = this.root.querySelector(settle)
      return a && b ? [[a, b] as [Element, Element]] : []
    })
  }

  private later(ms: number, run: () => void): void {
    this.moveTimers.push(window.setTimeout(run, ms))
  }

  private clearMoveTimers(): void {
    this.moveTimers.forEach((timer) => window.clearTimeout(timer))
    this.moveTimers = []
  }
}

function doubleBlink(gap: number): Keyframe[] {
  const total = BLINK_MS * 2 + gap
  const second = (BLINK_MS + gap) / total
  const scale = BLINK_MS / total
  const one = (offset: number): Keyframe[] =>
    BLINK.map((frame, i) => ({ ...frame, offset: offset + (i === 0 ? 0 : i === BLINK.length - 1 ? 1 : (frame.offset as number)) * scale }))
  return [...one(0), ...one(second)]
}
