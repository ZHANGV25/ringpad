import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBehavior } from './behavior'
import type { BehaviorHost } from './behavior'
import type { PandaMood } from './motion'
import type { MoveName } from './moves'

function host(mood: PandaMood = 'idle') {
  const state = { mood, busy: false, blinks: [] as boolean[], moves: [] as MoveName[], log: [] as string[] }
  const api: BehaviorHost = {
    mood: () => state.mood,
    busy: () => state.busy,
    blink: (double) => {
      state.blinks.push(double)
      if (double) state.log.push('double blink')
    },
    play: (move) => {
      state.moves.push(move)
      state.log.push(move)
    },
  }
  return { state, api }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the panda left to itself', () => {
  it('blinks every few seconds, irregularly', () => {
    const { state, api } = host()
    const life = createBehavior(api, { now: () => Date.now() })
    life.start()
    vi.advanceTimersByTime(60_000)
    life.stop()
    // A median gap near 3.8 s gives roughly 10 to 25 blinks a minute.
    expect(state.blinks.length).toBeGreaterThan(8)
    expect(state.blinks.length).toBeLessThan(30)
  })

  it('does not blink while asleep or mid-move', () => {
    const { state, api } = host('sleeping')
    const life = createBehavior(api, { now: () => Date.now() })
    life.start()
    vi.advanceTimersByTime(30_000)
    expect(state.blinks).toHaveLength(0)
    state.mood = 'idle'
    state.busy = true
    vi.advanceTimersByTime(30_000)
    expect(state.blinks).toHaveLength(0)
    life.stop()
  })

  it('has habits now and then, never the same one twice in a row', () => {
    const { state, api } = host()
    const life = createBehavior(api, { now: () => Date.now() })
    life.start()
    vi.advanceTimersByTime(10 * 60_000)
    life.stop()
    expect(state.moves.length).toBeGreaterThan(10)
    for (let i = 1; i < state.log.length; i += 1) {
      if (state.log[i] !== 'double blink') expect(state.log[i]).not.toBe(state.log[i - 1])
    }
    expect(state.moves.every((move) => ['lookAround', 'earFlickL', 'earFlickR', 'tilt', 'scratch', 'stretch'].includes(move))).toBe(true)
  })

  it('only flicks an ear while listening and does nothing while busy', () => {
    const { state, api } = host('listening')
    const life = createBehavior(api, { now: () => Date.now() })
    life.start()
    vi.advanceTimersByTime(5 * 60_000)
    expect(state.moves.every((move) => move.startsWith('earFlick'))).toBe(true)
    state.mood = 'talking'
    const before = state.moves.length
    vi.advanceTimersByTime(5 * 60_000)
    expect(state.moves).toHaveLength(before)
    life.stop()
  })

  it('stays quiet right after a reaction', () => {
    const { state, api } = host()
    const life = createBehavior(api, { now: () => Date.now(), random: () => 0 })
    life.start()
    // random 0 makes the habit gap its 5 s minimum; a reaction just before keeps it quiet.
    vi.advanceTimersByTime(4000)
    life.reacted()
    vi.advanceTimersByTime(1000)
    expect(state.moves).toHaveLength(0)
    life.stop()
  })

  it('stops scheduling when stopped', () => {
    const { state, api } = host()
    const life = createBehavior(api, { now: () => Date.now() })
    life.start()
    life.start()
    life.stop()
    vi.advanceTimersByTime(60_000)
    expect(state.blinks).toHaveLength(0)
    expect(state.moves).toHaveLength(0)
  })
})

describe('poking the panda', () => {
  it('escalates with quick pokes and starts over after a pause', () => {
    const { state, api } = host()
    const life = createBehavior(api, { now: () => Date.now() })
    const pokes: Array<MoveName | null> = []
    for (let i = 0; i < 10; i += 1) {
      const move = life.poke()
      pokes.push(move)
      if (move === 'pout') state.busy = true
      vi.advanceTimersByTime(300)
    }
    expect(pokes.slice(0, 3)).toEqual(['squish', 'wiggle', 'dizzy'])
    expect(pokes[4]).toBe('pout')
    // Still sulking: pokes in between are ignored, but ten in a row always gets the surprise.
    expect(pokes.slice(5, 9)).toEqual([null, null, null, null])
    expect(pokes[9]).toBe('spin')
    state.busy = false
    vi.advanceTimersByTime(2000)
    expect(life.poke()).toBe('squish')
  })
})
