import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isCalm, resetCalm } from './calm'
import { resetTicker, schedule, unschedule } from './ticker'

function setFocus(has: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(has)
  window.dispatchEvent(new Event(has ? 'focus' : 'blur'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

afterEach(() => {
  resetTicker()
  resetCalm()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ticker', () => {
  it('runs a job in the next frame, then asks for no more frames', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame')
    const job = vi.fn(() => false)
    schedule(job)
    expect(job).not.toHaveBeenCalled()
    vi.advanceTimersByTime(16)
    expect(job).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(500)
    expect(job).toHaveBeenCalledOnce()
    expect(frames).toHaveBeenCalledOnce()
  })

  it('runs everything scheduled before a frame in that one frame', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame')
    const a = vi.fn(() => false)
    const b = vi.fn(() => false)
    schedule(a)
    schedule(b)
    schedule(a)
    vi.advanceTimersByTime(16)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
    expect(frames).toHaveBeenCalledOnce()
  })

  it('keeps running a job that asks for another frame, with the time since the last one', () => {
    const steps: number[] = []
    const job = vi.fn((_now: number, dt: number) => {
      steps.push(dt)
      return steps.length < 3
    })
    schedule(job)
    vi.advanceTimersByTime(200)
    expect(job).toHaveBeenCalledTimes(3)
    expect(steps[0]).toBeCloseTo(1 / 60)
    expect(steps[1]).toBeGreaterThan(0.01)
    expect(steps[1]).toBeLessThan(0.03)
  })

  it('drops a job that is unscheduled before its frame', () => {
    const job = vi.fn(() => false)
    schedule(job)
    unschedule(job)
    vi.advanceTimersByTime(50)
    expect(job).not.toHaveBeenCalled()
  })

  it('drops a job that throws and still runs the others', () => {
    const broken = vi.fn(() => {
      throw new Error('boom')
    })
    const fine = vi.fn(() => false)
    schedule(broken)
    schedule(fine)
    vi.advanceTimersByTime(16)
    vi.advanceTimersByTime(50)
    expect(broken).toHaveBeenCalledOnce()
    expect(fine).toHaveBeenCalledOnce()
  })

  it('slows to four frames a second in calm mode and speeds back up at once', () => {
    isCalm()
    setFocus(false)
    vi.advanceTimersByTime(3000)
    expect(isCalm()).toBe(true)
    const job = vi.fn(() => true)
    schedule(job)
    vi.advanceTimersByTime(240)
    expect(job).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10)
    expect(job).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1000)
    expect(job).toHaveBeenCalledTimes(5)

    setFocus(true)
    vi.advanceTimersByTime(16)
    expect(job).toHaveBeenCalledTimes(6)
  })
})
