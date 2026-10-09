import { describe, expect, it } from 'vitest'
import { spring, springEasing } from './motion'
import { ALL_MOVES, REST, bake, poseToTransform, sample } from './moves'
import { SecondOrder, envelope, logNormal, weighted, wobble } from './physics'

function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe('springEasing', () => {
  it('starts at 0, ends at 1 and settles in under three seconds', () => {
    const { easing, duration } = springEasing({ stiffness: 260, damping: 14 })
    expect(easing.startsWith('linear(0, ')).toBe(true)
    expect(easing.endsWith(', 1)')).toBe(true)
    expect(duration).toBeGreaterThan(200)
    expect(duration).toBeLessThan(3000)
  })

  it('overshoots when bouncy and not when it has no bounce', () => {
    const peak = (easing: string) => Math.max(...easing.slice(7, -1).split(', ').map(Number))
    expect(peak(spring(0.35, 0.3).easing)).toBeGreaterThan(1.02)
    expect(peak(spring(0.3, 0).easing)).toBeLessThanOrEqual(1.002)
  })
})

describe('physics', () => {
  it('a second-order follower reaches its target and overshoots when underdamped', () => {
    const loose = new SecondOrder(3, 0.3, 0)
    let value = 0
    let peak = 0
    for (let i = 0; i < 240; i += 1) {
      value = loose.update(1 / 120, 1)
      peak = Math.max(peak, value)
    }
    expect(peak).toBeGreaterThan(1.2)
    expect(value).toBeCloseTo(1, 1)
  })

  it('stays stable with long steps', () => {
    const follower = new SecondOrder(6, 0.5, 2)
    let value = 0
    for (let i = 0; i < 20; i += 1) value = follower.update(0.25, 1)
    expect(Number.isFinite(value)).toBe(true)
    expect(Math.abs(value)).toBeLessThan(10)
  })

  it('wobble starts at rest and dies out', () => {
    expect(wobble(0, 5, 6, 0.2)).toBe(0)
    expect(Math.abs(wobble(2000, 5, 6, 0.2))).toBeLessThan(0.01)
  })

  it('envelope holds outside its keys and passes through them', () => {
    const keys: Array<[number, number]> = [
      [100, 0],
      [200, 10],
    ]
    expect(envelope(keys, 0)).toBe(0)
    expect(envelope(keys, 150)).toBeCloseTo(5)
    expect(envelope(keys, 500)).toBe(10)
  })

  it('log-normal gaps stay in range and centre on the median', () => {
    const random = seeded(7)
    const gaps = Array.from({ length: 2000 }, () => logNormal(3800, 0.5, 1500, 9000, random)).sort((a, b) => a - b)
    expect(gaps[0]).toBeGreaterThanOrEqual(1500)
    expect(gaps[gaps.length - 1]).toBeLessThanOrEqual(9000)
    expect(gaps[1000]).toBeGreaterThan(3400)
    expect(gaps[1000]).toBeLessThan(4200)
  })

  it('weighted picks by weight and copes with nothing to pick', () => {
    const random = seeded(3)
    const counts = { a: 0, b: 0 }
    for (let i = 0; i < 1000; i += 1) counts[weighted<'a' | 'b'>([['a', 3], ['b', 1]], random) ?? 'a'] += 1
    expect(counts.a).toBeGreaterThan(650)
    expect(counts.b).toBeGreaterThan(150)
    expect(weighted([], random)).toBeNull()
  })
})

describe('baked moves', () => {
  it.each(ALL_MOVES)('%s starts and ends at rest with one pose per frame', (name) => {
    const move = bake(name)
    expect(move.times[0]).toBe(0)
    expect(move.times[move.times.length - 1]).toBe(move.duration)
    for (let i = 1; i < move.times.length; i += 1) expect(move.times[i]).toBeGreaterThan(move.times[i - 1])
    for (const track of Object.values(move.tracks)) {
      expect(track).toHaveLength(move.times.length)
      expect(track?.[track.length - 1]).toEqual(REST)
      for (const pose of track ?? []) for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true)
    }
  })

  it.each(ALL_MOVES)('%s never jumps between frames', (name) => {
    const move = bake(name)
    for (const [part, track] of Object.entries(move.tracks)) {
      // A frame is 1/60 s. Arms snap up for a cheer by design; everything else stays gentler, and
      // the spin's big translations only cancel out its rotation.
      const maxTurn = part.startsWith('arm') ? 30 : name === 'spin' ? 25 : 12
      for (let i = 1; i < (track?.length ?? 0) - 1; i += 1) {
        const a = track![i - 1]
        const b = track![i]
        expect(Math.abs(b.r - a.r)).toBeLessThan(maxTurn)
        expect(Math.abs(b.y - a.y)).toBeLessThan(name === 'spin' ? 30 : 14)
      }
    }
  })

  it('a hop crouches, rises and squashes on landing', () => {
    const hop = bake('hop')
    expect(sample(hop, 'root', 120).y).toBeGreaterThan(1)
    expect(sample(hop, 'root', 310).y).toBeLessThan(-11)
    expect(sample(hop, 'root', 460).sy).toBeLessThan(0.95)
    expect(sample(hop, 'shadow', 310).sx).toBeLessThan(0.8)
  })

  it('the spin turns all the way round about the belly', () => {
    const spin = bake('spin')
    const half = spin.times.findIndex((t) => t >= 500)
    const pose = spin.tracks.root![half]
    const rad = (pose.r * Math.PI) / 180
    // The belly, 72 units above the feet, stays put: rotation plus translation cancel out.
    expect(pose.x + 72 * Math.sin(rad)).toBeCloseTo(0, 3)
    expect(Math.max(...spin.tracks.root!.map((p) => p.r))).toBeGreaterThan(359)
  })

  it('samples between frames and rests outside the move', () => {
    const hop = bake('hop')
    expect(sample(hop, 'root', -5)).toEqual(REST)
    expect(sample(hop, 'root', hop.duration + 1)).toEqual(REST)
    expect(sample(hop, 'armL', 100)).toEqual(REST)
  })

  it('writes transforms with the same functions every time, in pixels', () => {
    expect(poseToTransform({ x: 10, y: -4, r: 3, sx: 1, sy: 0.9 }, 0.5)).toBe(
      'translate(5.000px, -2.000px) rotate(3.000deg) scale(1.0000, 0.9000)',
    )
  })
})
