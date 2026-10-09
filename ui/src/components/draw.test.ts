import { describe, expect, it } from 'vitest'
import { fitPeaks, markerStart, waveformBars } from './draw'

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

describe('markerStart', () => {
  it('marks the newest share of the strip', () => {
    expect(markerStart(300, 5, 30)).toBeCloseTo(250)
    expect(markerStart(300, 60, 30)).toBe(0)
  })

  it('has no marker without both lengths', () => {
    expect(markerStart(300)).toBeNull()
    expect(markerStart(300, 5)).toBeNull()
  })
})
