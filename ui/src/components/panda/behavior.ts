import type { PandaMood } from './motion'
import type { MoveName } from './moves'
import { logNormal, weighted } from './physics'

/**
 * The panda's own life between events: blinks at human rhythms, and now and then a small habit
 * (a glance around, an ear flick, a head tilt). Timing is random but shaped: blink gaps are
 * log-normal like real ones, habits never repeat back to back and each rests a while after use,
 * and nothing spontaneous happens right after a reaction, so it never feels like a busy loop.
 */

export interface BehaviorHost {
  mood(): PandaMood
  busy(): boolean
  blink(double: boolean): void
  play(move: MoveName): void
}

interface Options {
  random?: () => number
  now?: () => number
}

/** Median gap between blinks per mood, in seconds; null means no blinking. */
const BLINK_MEDIAN: Record<PandaMood, number | null> = {
  idle: 3.8,
  listening: 5,
  happy: 3.8,
  talking: 2.8,
  sleeping: null,
  confused: 3,
  celebrate: null,
}
const DOUBLE_BLINK = 0.12

type Habit = 'glance' | 'earFlick' | 'tilt' | 'doubleBlink' | 'scratch' | 'stretch'

/** How likely each habit is while the user is around, and once they have been away a while. */
const HABITS: Record<Habit, [number, number]> = {
  glance: [30, 30],
  earFlick: [25, 15],
  tilt: [20, 10],
  doubleBlink: [10, 10],
  scratch: [10, 15],
  stretch: [5, 15],
}
/** Moods calm enough for habits; only ear flicks while listening, nothing while busy. */
const HABIT_MOODS: Partial<Record<PandaMood, Habit[]>> = {
  idle: Object.keys(HABITS) as Habit[],
  listening: ['earFlick', 'doubleBlink'],
}
const AWAY_MS = 30_000
const QUIET_AFTER_REACTION_MS = 4000

/** Pokes in quick succession escalate: a squish, a wiggle, dizzy, a pout, and a surprise at ten. */
const POKE_GAP_MS = 1500
const POKES: Record<number, MoveName> = { 1: 'squish', 2: 'wiggle', 3: 'dizzy', 5: 'pout', 10: 'spin' }

export interface Behavior {
  start(): void
  stop(): void
  /** The user did something (moved the pointer, pressed a key). */
  attention(): void
  /** A reaction just played; keeps habits from piling on. */
  reacted(): void
  /** The panda was clicked: returns the move to play, or null to ignore it. */
  poke(): MoveName | null
}

export function createBehavior(host: BehaviorHost, { random = Math.random, now = () => performance.now() }: Options = {}): Behavior {
  let running = false
  let blinkTimer: number | undefined
  let habitTimer: number | undefined
  let lastAttention = now()
  let lastReaction = -Infinity
  let lastHabit: Habit | null = null
  const restingUntil = new Map<Habit, number>()
  let pokes = 0
  let lastPoke = -Infinity

  const scheduleBlink = () => {
    const median = BLINK_MEDIAN[host.mood()]
    const gap = median === null ? 2000 : logNormal(median * 1000, 0.5, 1500, 9000, random)
    blinkTimer = window.setTimeout(() => {
      if (BLINK_MEDIAN[host.mood()] !== null && !host.busy()) host.blink(random() < DOUBLE_BLINK)
      scheduleBlink()
    }, gap)
  }

  const scheduleHabit = () => {
    const away = now() - lastAttention > AWAY_MS
    // Exponential gaps (mean 9 s, a bit longer once the user is away) feel random, not periodic.
    const gap = Math.min(20_000, Math.max(5000, -Math.log(1 - random()) * 9000)) * (away ? 1.4 : 1)
    habitTimer = window.setTimeout(() => {
      runHabit(away)
      scheduleHabit()
    }, gap)
  }

  const runHabit = (away: boolean) => {
    const allowed = HABIT_MOODS[host.mood()]
    if (!allowed || host.busy() || now() - lastReaction < QUIET_AFTER_REACTION_MS) return
    const t = now()
    const choices = allowed
      .filter((habit) => habit !== lastHabit && (restingUntil.get(habit) ?? 0) <= t)
      .map((habit): [Habit, number] => [habit, HABITS[habit][away ? 1 : 0]])
    const habit = weighted(choices, random)
    if (!habit) return
    lastHabit = habit
    restingUntil.set(habit, t + 20_000 + random() * 25_000)
    if (habit === 'doubleBlink') host.blink(true)
    else host.play(habitMove(habit, random))
  }

  return {
    start() {
      if (running) return
      running = true
      scheduleBlink()
      scheduleHabit()
    },
    stop() {
      running = false
      window.clearTimeout(blinkTimer)
      window.clearTimeout(habitTimer)
    },
    attention() {
      lastAttention = now()
    },
    reacted() {
      lastReaction = now()
    },
    poke() {
      const t = now()
      pokes = t - lastPoke < POKE_GAP_MS ? pokes + 1 : 1
      lastPoke = t
      lastReaction = t
      const move = POKES[pokes]
      if (pokes >= 10) pokes = 0
      if (move) return move
      // Between the milestones it alternates, unless it is still sulking.
      if (host.busy() && pokes > 5) return null
      return pokes % 2 === 0 ? 'wiggle' : 'squish'
    },
  }
}

function habitMove(habit: Exclude<Habit, 'doubleBlink'>, random: () => number): MoveName {
  if (habit === 'glance') return 'lookAround'
  if (habit === 'earFlick') return random() < 0.5 ? 'earFlickL' : 'earFlickR'
  return habit
}
