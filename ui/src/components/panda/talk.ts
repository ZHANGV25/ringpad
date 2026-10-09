import { isCalm } from '../../lib/calm'
import { schedule, unschedule } from '../../lib/ticker'
import { canAnimate, reducedMotion } from './motion'
import { SecondOrder } from './physics'
import type { Rig } from './rig'

/** Quietest and loudest levels the mouth responds to, in dBFS. */
const FLOOR_DB = -42
const FULL_DB = -6
/** The mouth opens fast and closes slower, like a jaw: one-pole smoothing with two time constants. */
const ATTACK_S = 0.02
const RELEASE_S = 0.1
/** A new syllable: the mouth was nearly shut and opens past this. */
const SYLLABLE_OPEN = 0.35
const SYLLABLE_REARM = 0.18
/** How open the mouth rests when it is not following the audio. */
const STILL_OPEN = 0.55

function openness(level: number): number {
  if (level <= 0) return 0
  const db = 20 * Math.log10(level)
  return Math.min(1, Math.max(0, (db - FLOOR_DB) / (FULL_DB - FLOOR_DB)))
}

/**
 * Lip sync from the outgoing level. Runs in the shared frame (lib/ticker) only while talking, so it
 * shares frames with the meters, and holds the mouth still in calm mode, when no one is looking.
 * Each new syllable kicks the head a degree or two, alternating sides, through a loose spring,
 * which is what makes it read as speech rather than a flapping mouth.
 */
export function startTalking(rig: Rig, level: () => number): () => void {
  if (!canAnimate() || reducedMotion()) {
    rig.talk(STILL_OPEN, 0)
    return () => rig.stopTalking()
  }
  const nod = new SecondOrder(3.2, 0.35, 0)
  let open = 0
  let kick = 0
  let side = 1
  let armed = true
  const job = (_now: number, step: number) => {
    if (isCalm()) {
      rig.talk(STILL_OPEN, 0)
      return true
    }
    const dt = Math.min(0.05, Math.max(0.001, step))
    const target = openness(level())
    const tau = target > open ? ATTACK_S : RELEASE_S
    open += (target - open) * (1 - Math.exp(-dt / tau))
    if (armed && open > SYLLABLE_OPEN) {
      kick = side * (1.5 + Math.random())
      side = -side
      armed = false
    }
    if (open < SYLLABLE_REARM) armed = true
    kick *= Math.exp(-dt / 0.08)
    rig.talk(open, nod.update(dt, kick))
    return true
  }
  schedule(job)
  return () => {
    unschedule(job)
    rig.stopTalking()
  }
}
