import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCalm, resetCalm } from '../../lib/calm'
import { Panda, pandaHeight } from './Panda'
import { bake, poseToTransform, sample } from './moves'
import { Rig } from './rig'

interface Call {
  el: Element
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancelled: boolean
}

/** jsdom has no Web Animations; record what would have played. */
function mockAnimate(): Call[] {
  const calls: Call[] = []
  const animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const call: Call = { el: this, keyframes, options, cancelled: false }
    calls.push(call)
    return { cancel: () => (call.cancelled = true) } as unknown as Animation
  })
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true })
  return calls
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia
}

const classOf = (call: Call) => call.el.className

/** Just enough of DOMMatrix for 2D transforms. */
class FakeMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0
  constructor(init?: string) {
    const values = init ? /matrix\(([^)]+)\)/.exec(init)?.[1].split(',').map(Number) : undefined
    if (values) [this.a, this.b, this.c, this.d, this.e, this.f] = values
  }
  inverse(): FakeMatrix {
    const det = this.a * this.d - this.b * this.c
    const r = new FakeMatrix()
    r.a = this.d / det
    r.b = -this.b / det
    r.c = -this.c / det
    r.d = this.a / det
    r.e = (this.c * this.f - this.d * this.e) / det
    r.f = (this.b * this.e - this.a * this.f) / det
    return r
  }
  multiply(o: FakeMatrix): FakeMatrix {
    const r = new FakeMatrix()
    r.a = this.a * o.a + this.c * o.b
    r.b = this.b * o.a + this.d * o.b
    r.c = this.a * o.c + this.c * o.d
    r.d = this.b * o.c + this.d * o.d
    r.e = this.a * o.e + this.c * o.f + this.e
    r.f = this.b * o.e + this.d * o.f + this.f
    return r
  }
  toString(): string {
    return `matrix(${[this.a, this.b, this.c, this.d, this.e, this.f].join(', ')})`
  }
}

function pandaRoot(): HTMLElement {
  return document.querySelector('.panda') as HTMLElement
}

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  resetCalm()
})

describe('Rig', () => {
  it('carries a loop into the next mood instead of jumping', () => {
    mockReducedMotion(false)
    vi.stubGlobal('DOMMatrix', FakeMatrix)
    const calls = mockAnimate()
    render(<Panda mood="confused" />)
    const root = pandaRoot()
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      const pondering = (el as Element).classList.contains('hd-mood') && root.dataset.mood === 'confused'
      return { transform: pondering ? 'matrix(1, 0, 0, 1, 0, 10)' : 'none' } as CSSStyleDeclaration
    })
    const rig = new Rig(root, 'confused', 1)
    rig.setMood('idle')
    const settle = calls.find((call) => classOf(call).includes('hd-settle'))
    expect(settle?.keyframes[0].transform).toBe('matrix(1, 0, 0, 1, 0, 10)')
    expect(settle?.keyframes[1].transform).toBe('matrix(1, 0, 0, 1, 0, 0)')
    expect(settle?.options.composite).toBeUndefined()
    // Layers that did not move get no bridge.
    expect(calls.some((call) => classOf(call).includes('rt-settle'))).toBe(false)
  })

  it('blinks across a change of eyes and never stacks blinks', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    render(<Panda mood="idle" />)
    const rig = new Rig(pandaRoot(), 'idle', 1)
    rig.setMood('happy')
    expect(pandaRoot().dataset.face).toBe('happy open')
    const blinks = () => calls.filter((call) => classOf(call).includes('-blink'))
    expect(blinks()).toHaveLength(2)
    rig.setMood('idle')
    rig.blink()
    // Eyes were not open, then a blink is already running.
    expect(blinks()).toHaveLength(2)
  })

  it('hands a running move over to the next one from where it is', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    let now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    render(<Panda mood="idle" />)
    const rig = new Rig(pandaRoot(), 'idle', 1)
    rig.play('hop')
    const hop = calls.filter((call) => classOf(call).includes('rt-act'))
    expect(hop).toHaveLength(1)
    expect(rig.busy()).toBe(true)
    now += 300
    rig.play('nod')
    expect(hop[0].cancelled).toBe(true)
    const root = calls.filter((call) => classOf(call).includes('rt-act'))[1]
    // The nod does not move the root, but the hop was mid-air: it starts there and comes down.
    expect(root.keyframes[0].transform).toBe(poseToTransform(sample(bake('hop'), 'root', 300), 1))
    expect(root.keyframes[root.keyframes.length - 1].transform).toBe(poseToTransform({ x: 0, y: 0, r: 0, sx: 1, sy: 1 }, 1))
  })

  it('changes faces during a move and gives the mood its face back after', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    mockAnimate()
    render(<Panda mood="idle" />)
    const rig = new Rig(pandaRoot(), 'idle', 1)
    rig.play('cheer')
    act(() => vi.advanceTimersByTime(10))
    expect(pandaRoot().dataset.face).toBe('happy open')
    act(() => vi.advanceTimersByTime(2000))
    expect(pandaRoot().dataset.face).toBe('')
  })

  it('only changes faces when motion is reduced', () => {
    vi.useFakeTimers()
    mockReducedMotion(true)
    const calls = mockAnimate()
    render(<Panda mood="idle" />)
    const rig = new Rig(pandaRoot(), 'idle', 1)
    rig.play('cheer')
    rig.blink()
    act(() => vi.advanceTimersByTime(10))
    expect(calls).toHaveLength(0)
    expect(pandaRoot().dataset.face).toBe('happy open')
  })
})

describe('Panda', () => {
  it('is decorative unless it has a label', () => {
    const { rerender } = render(<Panda mood="idle" />)
    expect(pandaRoot().getAttribute('aria-hidden')).toBe('true')
    rerender(<Panda mood="idle" label="Ringpad's panda" />)
    expect(screen.getByRole('img', { name: "Ringpad's panda" })).toBeTruthy()
  })

  it('shows its mood and sizes itself in rig units', () => {
    render(<Panda mood="sleeping" size={120} className="extra" />)
    const root = pandaRoot()
    expect(root.dataset.mood).toBe('sleeping')
    expect(root.dataset.face).toBe('closed')
    expect(root.style.getPropertyValue('--u')).toBe('0.6px')
    expect(root.className).toBe('panda extra')
    expect(pandaHeight(120)).toBe(134)
  })

  it('switches mood at once when it cannot animate', () => {
    const { rerender } = render(<Panda mood="idle" />)
    rerender(<Panda mood="sleeping" />)
    expect(pandaRoot().dataset.mood).toBe('sleeping')
  })

  it('yawns before it falls asleep and shakes itself awake', () => {
    vi.useFakeTimers()
    mockReducedMotion(false)
    const calls = mockAnimate()
    const { rerender } = render(<Panda mood="idle" />)
    rerender(<Panda mood="sleeping" />)
    expect(pandaRoot().dataset.mood).toBe('idle')
    const yawnHead = calls.find((call) => classOf(call).includes('hd-act'))
    expect(yawnHead?.options.duration).toBe(bake('yawn').duration)
    act(() => vi.advanceTimersByTime(1200))
    expect(pandaRoot().dataset.mood).toBe('sleeping')
    const before = calls.length
    rerender(<Panda mood="idle" />)
    expect(pandaRoot().dataset.mood).toBe('idle')
    expect(calls.slice(before).some((call) => call.options.duration === bake('shakeOff').duration)).toBe(true)
  })

  it('cheers when it celebrates, but not twice in a row', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    const { rerender } = render(<Panda mood="idle" />)
    rerender(<Panda mood="celebrate" />)
    expect(calls.some((call) => call.options.duration === bake('cheer').duration)).toBe(true)
    rerender(<Panda mood="idle" />)
    const before = calls.length
    rerender(<Panda mood="celebrate" />)
    const again = calls.slice(before)
    expect(again.some((call) => call.options.duration === bake('cheer').duration)).toBe(false)
    expect(again.some((call) => call.options.duration === bake('hop').duration)).toBe(true)
  })

  it('plays cues, varying repeats, and reacts when poked', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    const { rerender } = render(<Panda mood="idle" />)
    rerender(<Panda mood="idle" cue={{ kind: 'hop', id: 1 }} />)
    expect(calls.some((call) => call.options.duration === bake('hop').duration)).toBe(true)
    rerender(<Panda mood="idle" cue={{ kind: 'hop', id: 2 }} />)
    expect(calls.some((call) => call.options.duration === bake('doubleNod').duration)).toBe(true)
    const before = calls.length
    fireEvent.click(pandaRoot())
    expect(calls.slice(before).some((call) => call.options.duration === bake('squish').duration)).toBe(true)
  })

  it('moves its mouth with the level while talking and stops when done', () => {
    mockReducedMotion(false)
    mockAnimate()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    const { rerender } = render(<Panda mood="talking" level={0.5} />)
    const mouth = document.querySelector('.mo-talk') as HTMLElement
    const start = performance.now()
    act(() => {
      for (let i = 0; i < 20; i += 1) frames[frames.length - 1](start + (i + 1) * 16)
    })
    const open = Number(/scaleY\(([\d.]+)\)/.exec(mouth.style.transform)?.[1])
    expect(open).toBeGreaterThan(0.8)
    // Its own layer while it talks, so each frame repaints nothing.
    expect(mouth.style.willChange).toBe('transform')
    rerender(<Panda mood="idle" level={0} />)
    const pending = frames.length
    act(() => frames[frames.length - 1](start + 400))
    expect(frames.length).toBe(pending)
    expect(mouth.style.transform).toBe('')
    expect(mouth.style.willChange).toBe('')
  })

  it('holds the mouth still while Ringpad is in the background', () => {
    mockReducedMotion(false)
    mockAnimate()
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    expect(isCalm()).toBe(false)
    vi.advanceTimersByTime(3500)
    expect(isCalm()).toBe(true)
    render(<Panda mood="talking" level={1} />)
    act(() => vi.advanceTimersByTime(300))
    const mouth = document.querySelector('.mo-talk') as HTMLElement
    expect(mouth.style.transform).toBe('scaleY(0.718)')
    expect(frames).toHaveLength(0)
  })

  it('holds a still open mouth when motion is reduced', () => {
    mockReducedMotion(true)
    render(<Panda mood="talking" level={1} />)
    expect((document.querySelector('.mo-talk') as HTMLElement).style.transform).toMatch(/^scaleY\(/)
  })

  it('looks toward the pointer, and the head turns after the eyes', () => {
    mockReducedMotion(false)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    render(<Panda mood="idle" size={200} />)
    fireEvent.pointerMove(window, { clientX: 400, clientY: 0 })
    act(() => frames.forEach((frame) => frame(0)))
    const look = document.querySelector('.look') as HTMLElement
    expect(look.style.transform).toMatch(/^translate\(3\.\d+px/)
    expect((document.querySelector('.hd-look') as HTMLElement).style.transform).toMatch(/rotate\(1\.\d+deg\)/)
  })
})
