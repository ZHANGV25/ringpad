import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCalm, onCalm, resetCalm } from './calm'

function focus(has: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(has)
  window.dispatchEvent(new Event(has ? 'focus' : 'blur'))
}

afterEach(() => {
  resetCalm()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('calm mode', () => {
  it('turns on a few seconds after the window loses focus and off as soon as it is back', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const seen: boolean[] = []
    onCalm((calm) => seen.push(calm))
    expect(isCalm()).toBe(false)
    focus(false)
    vi.advanceTimersByTime(2000)
    expect(isCalm()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(isCalm()).toBe(true)
    expect(document.documentElement.dataset.calm).toBe('')
    focus(true)
    expect(isCalm()).toBe(false)
    expect(document.documentElement.dataset.calm).toBeUndefined()
    expect(seen).toEqual([true, false])
  })

  it('a quick trip to another window does not count', () => {
    vi.useFakeTimers()
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    isCalm()
    focus(false)
    vi.advanceTimersByTime(1500)
    focus(true)
    vi.advanceTimersByTime(5000)
    expect(isCalm()).toBe(false)
  })

  it('is calm at once when the page is hidden', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    isCalm()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(isCalm()).toBe(true)
  })
})
