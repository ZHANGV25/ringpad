import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import { resetTicker } from '../lib/ticker'
import { meterPosition } from './LevelMeter'
import { renderApp } from '../test/render'

afterEach(() => {
  resetTicker()
  vi.useRealTimers()
})

describe('meterPosition', () => {
  it('shows the top 60 dB, like the ear hears it', () => {
    expect(meterPosition(1)).toBe(1)
    expect(meterPosition(0.1)).toBeCloseTo(2 / 3)
    expect(meterPosition(0.001)).toBeCloseTo(0)
    expect(meterPosition(0.0001)).toBe(0)
  })

  it('treats silence and nonsense as empty and clamps hot levels', () => {
    expect(meterPosition(0)).toBe(0)
    expect(meterPosition(-1)).toBe(0)
    expect(meterPosition(Number.NaN)).toBe(0)
    expect(meterPosition(4)).toBe(1)
  })
})

describe('LevelMeter', () => {
  it('rises at once, then falls back slowly with the peak held', async () => {
    const api = await renderApp()
    const meter = screen.getByRole('meter', { name: 'What your team hears' })
    const fill = meter.querySelector('.level-fill') as HTMLElement
    const peak = meter.querySelector('.level-peak') as HTMLElement
    const scale = () => Number(/scaleX\(([\d.]+)\)/.exec(fill.style.transform)?.[1] ?? 0)

    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
    // Forget the frame the first render asked for under real timers.
    resetTicker()
    act(() => api.simulateMeters({ source: 0, mic: 0, outgoing: 1 }))
    act(() => vi.advanceTimersByTime(16))
    expect(scale()).toBe(1)
    expect(peak.style.opacity).toBe('1')

    act(() => api.simulateMeters({ source: 0, mic: 0, outgoing: 0 }))
    act(() => vi.advanceTimersByTime(500))
    // 20 dB a second on a 60 dB scale: a sixth of the way down in half a second.
    expect(scale()).toBeGreaterThan(0.78)
    expect(scale()).toBeLessThan(0.88)
    expect(peak.style.transform).toBe('translateX(100.00%)')

    act(() => vi.advanceTimersByTime(5000))
    expect(scale()).toBe(0)
    expect(peak.style.opacity).toBe('0')
    expect(meter.getAttribute('aria-valuenow')).toBe('0')
  })

})
