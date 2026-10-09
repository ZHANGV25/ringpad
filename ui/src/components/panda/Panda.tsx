import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'
import { isCalm, onCalm } from '../../lib/calm'
import { PandaArt } from './PandaArt'
import { createBehavior } from './behavior'
import type { Behavior } from './behavior'
import { canAnimate, reducedMotion, spring } from './motion'
import type { PandaMood, PandaReaction } from './motion'
import type { MoveName } from './moves'
import { MAX_LOOK, Rig } from './rig'
import { startTalking } from './talk'
import '../../styles/panda.css'

export type { PandaMood, PandaReaction }

/** A one-shot move. Change `id` to play the same move again. */
export interface PandaCue {
  kind: PandaReaction
  id: number
}

interface PandaProps {
  mood: PandaMood
  /** Width in pixels. */
  size?: number
  /** Loudness from 0 to 1 (or a function that reads it each frame); the mouth follows it while talking. */
  level?: number | (() => number)
  cue?: PandaCue | null
  /** Accessible description. Without it the panda is decorative. */
  label?: string
  className?: string
}

const RIG_W = 200
const RIG_H = 224
/** The yawn hands over to sleeping as the head drops. */
const YAWN_MS = 1150
/** Asleep this long, the panda stops moving altogether, so the window draws nothing. */
const DEEP_SLEEP_MS = 25_000
/** At most one big reaction in this window; repeats get a smaller variant. */
const BIG_GAP_MS = 10_000

const POSE = spring(0.5, 0.2)
const POP = spring(0.35, 0.3)

/** Each panda breathes and sways at slightly different speeds, so two never move in lockstep. */
function ownPeriods(): Record<string, string> {
  const vary = (seconds: number) => `${(seconds * (0.9 + Math.random() * 0.2)).toFixed(2)}s`
  return {
    '--breath': vary(3.6),
    '--sway': vary(11.3),
    '--head': vary(7.9),
    '--pose-ease': POSE.easing,
    '--pose-dur': `${POSE.duration}ms`,
    '--pop-ease': POP.easing,
    '--pop-dur': `${POP.duration}ms`,
  }
}

/**
 * Ringpad's panda. Breathes, blinks and has little habits of its own; reacts to the mood and cues
 * it is given. Built from compositor layers (see PandaArt), so it costs the page almost nothing.
 */
export function Panda({ mood, size = 96, level = 0, cue = null, label, className }: PandaProps) {
  const ref = useRef<HTMLDivElement>(null)
  const levelRef = useRef(level)
  // React sets the first mood only; the rig owns data-mood after that.
  const [first] = useState(() => ({ mood, periods: ownPeriods() }))
  const { rig, behavior } = usePandaRig(ref, first.mood, size / RIG_W)

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useMood(rig, behavior, mood)
  useCue(rig, behavior, cue)
  useTalking(rig, levelRef, mood === 'talking')
  useLookAtPointer(ref, rig, behavior, mood !== 'sleeping')

  const style = { ...first.periods, '--u': `${size / RIG_W}px` } as CSSProperties
  const poke = () => {
    const move = behavior.current?.poke()
    if (move) rig.current?.play(move)
  }

  return (
    <div
      ref={ref}
      className={className ? `panda ${className}` : 'panda'}
      style={style}
      data-mood={first.mood}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onClick={poke}
    >
      <PandaArt />
    </div>
  )
}

/** Panda height in pixels for a given width. */
export function pandaHeight(size: number): number {
  return Math.round((size * RIG_H) / RIG_W)
}

type RigRef = RefObject<Rig | null>
type BehaviorRef = RefObject<Behavior | null>

function usePandaRig(ref: RefObject<HTMLDivElement | null>, mood: PandaMood, unit: number): { rig: RigRef; behavior: BehaviorRef } {
  const rig = useRef<Rig | null>(null)
  const behavior = useRef<Behavior | null>(null)
  const unitRef = useRef(unit)

  useLayoutEffect(() => {
    unitRef.current = unit
    rig.current?.setUnit(unit)
  }, [unit])

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return undefined
    const made = new Rig(root, mood, unitRef.current)
    const life = createBehavior({
      mood: () => made.currentMood,
      busy: () => made.busy(),
      blink: (double) => made.blink(double),
      play: (move) => made.play(move),
    })
    rig.current = made
    behavior.current = life
    // Its own life only runs while you are looking at Ringpad.
    const sync = (calm: boolean) => (calm || reducedMotion() ? life.stop() : life.start())
    sync(isCalm())
    const off = onCalm(sync)
    return () => {
      off()
      life.stop()
      made.dispose()
      rig.current = null
      behavior.current = null
    }
    // Made once on purpose: later moods go through setMood, which needs the old pose to measure.
  }, [ref])

  return { rig, behavior }
}

/** Mood changes with a little acting: a yawn before sleep, a shake on waking, a cheer, a nod. */
function useMood(rig: RigRef, behavior: BehaviorRef, mood: PandaMood) {
  const lastBig = useRef(-Infinity)
  const [deep, setDeep] = useState(false)

  useLayoutEffect(() => {
    const panda = rig.current
    if (!panda || panda.currentMood === mood) return undefined
    const from = panda.currentMood
    const animated = canAnimate() && !reducedMotion()
    const big = (move: MoveName, smaller: MoveName | null) => {
      const now = performance.now()
      const choice = now - lastBig.current < BIG_GAP_MS ? smaller : move
      if (choice === move) lastBig.current = now
      if (choice) panda.play(choice)
      behavior.current?.reacted()
    }
    if (mood === 'sleeping' && animated) {
      panda.play('yawn')
      const timer = window.setTimeout(() => panda.setMood('sleeping'), YAWN_MS)
      return () => window.clearTimeout(timer)
    }
    panda.setMood(mood)
    if (mood === 'celebrate') big('cheer', 'hop')
    else if (from === 'sleeping') big('shakeOff', 'gasp')
    else if (mood === 'confused') big('gasp', null)
    else if (from === 'confused') panda.play('nod')
    return undefined
  }, [rig, behavior, mood])

  // Deep sleep: after a while asleep the loops stop and the z's fade, so nothing draws.
  useEffect(() => {
    if (mood !== 'sleeping') {
      setDeep(false)
      return undefined
    }
    const timer = window.setTimeout(() => setDeep(true), DEEP_SLEEP_MS)
    return () => window.clearTimeout(timer)
  }, [mood])

  useEffect(() => {
    rig.current?.setDeep(deep)
  }, [rig, deep])
}

/** Cues from outside (a clip was taken). Repeats within a few seconds get a different move. */
const VARIANTS: Partial<Record<PandaReaction, PandaReaction[]>> = {
  hop: ['hop', 'doubleNod', 'hop', 'squish'],
}

function useCue(rig: RigRef, behavior: BehaviorRef, cue: PandaCue | null) {
  const recent = useRef({ kind: '', at: -Infinity, count: 0 })
  useEffect(() => {
    if (!cue || !rig.current) return
    const now = performance.now()
    const last = recent.current
    const count = last.kind === cue.kind && now - last.at < BIG_GAP_MS ? last.count + 1 : 0
    recent.current = { kind: cue.kind, at: now, count }
    const variants = VARIANTS[cue.kind]
    rig.current.play(variants ? variants[count % variants.length] : cue.kind)
    behavior.current?.reacted()
  }, [rig, behavior, cue])
}

/** While talking, an animation frame loop turns the outgoing level into lip sync. */
function useTalking(rig: RigRef, levelRef: RefObject<number | (() => number)>, on: boolean) {
  useEffect(() => {
    const panda = rig.current
    if (!on || !panda) return undefined
    return startTalking(panda, () => {
      const level = levelRef.current
      return typeof level === 'function' ? level() : (level ?? 0)
    })
  }, [rig, levelRef, on])
}

/** The eyes follow the pointer; the head turns after them a beat later (see panda.css). */
function useLookAtPointer(ref: RefObject<HTMLDivElement | null>, rig: RigRef, behavior: BehaviorRef, on: boolean) {
  useEffect(() => {
    const root = ref.current
    if (!root || !on || reducedMotion() || typeof window.requestAnimationFrame !== 'function') return undefined
    let pending = 0
    let pointer = { x: 0, y: 0 }
    const aim = () => {
      pending = 0
      const box = root.getBoundingClientRect()
      const dx = pointer.x - (box.left + box.width / 2)
      const dy = pointer.y - (box.top + box.height * 0.4)
      const distance = Math.hypot(dx, dy) || 1
      const reach = Math.min(1, distance / 260)
      rig.current?.lookAt((dx / distance) * reach * MAX_LOOK, (dy / distance) * reach * MAX_LOOK * 0.8)
    }
    const onMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY }
      behavior.current?.attention()
      if (!pending) pending = window.requestAnimationFrame(aim)
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.cancelAnimationFrame(pending)
      rig.current?.lookAt(0, 0)
    }
  }, [ref, rig, behavior, on])
}
