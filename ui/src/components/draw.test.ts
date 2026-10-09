import { describe, expect, it } from 'vitest'
import { fillBars, fitPeaks, waveformBars } from './draw'

describe('fitPeaks', () => {
  it('keeps the loudest value of each bucket when shrinking', () => {
    expect(fitPeaks([0.1, 0.9, 0.2, 0.3], 2)).toEqual([0.9, 0.3])
  })

  it('repeats values when stretching', () => {
    expect(fitPeaks([0.2, 0.8], 4)).toEqual([0.2, 0.2, 0.8, 0.8])
  })

  it('returns nothing for no peaks or no room', () => {
    expect(fitPeaks([], 4)).toEqual([])
    expect(fitPeaks([0.5], 0)).toEqual([])
  })
})

describe('waveformBars', () => {
  it('spans the whole width with mirrored bars', () => {
    const bars = waveformBars([0, 0.5, 1], 12, 10, 2)
    expect(bars).toHaveLength(6)
    expect(bars[0].x).toBe(0)
    expect(bars[5].x).toBe(20)
    expect(bars[0].width).toBe(2)
    const loudest = bars[5]
    expect(loudest.height).toBeCloseTo(18)
    expect(loudest.y).toBeCloseTo(1)
  })

  it('never draws a bar shorter than one device pixel', () => {
    const bars = waveformBars([0], 4, 10, 1)
    expect(bars.every((bar) => bar.height >= 1)).toBe(true)
  })
})

describe('fillBars', () => {
  it('fills all bars as one path in one colour', () => {
    const calls: string[] = []
    const context = {
      beginPath: () => calls.push('begin'),
      rect: (x: number) => calls.push(`rect ${x}`),
      fill: () => calls.push('fill'),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D
    fillBars(context, waveformBars([0.5, 1], 4, 10, 1), '#123')
    expect(calls).toEqual(['begin', 'rect 0', 'rect 2', 'fill'])
    expect(context.fillStyle).toBe('#123')
  })

  it('draws nothing for no bars', () => {
    const context = { beginPath: () => { throw new Error('drew') } } as unknown as CanvasRenderingContext2D
    expect(() => fillBars(context, [], '#000')).not.toThrow()
  })
})
