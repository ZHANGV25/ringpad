import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Panda } from './Panda'
import { changeMood, createFollower, playMoodChange, playReaction, springEasing } from './motion'

/** jsdom has no Web Animations; record what would have played. */
function mockAnimate() {
  const calls: Array<{ el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }> = []
  const animate = vi.fn(function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    calls.push({ el: this, keyframes, options })
    return {} as Animation
  })
  Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true })
  return calls
}

function removeAnimate() {
  Reflect.deleteProperty(Element.prototype, 'animate')
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia
}

describe('springEasing', () => {
  it('starts at 0, ends at 1 and settles in under three seconds', () => {
    const { easing, duration } = springEasing({ stiffness: 260, damping: 14 })
    expect(easing.startsWith('linear(0, ')).toBe(true)
    expect(easing.endsWith(', 1)')).toBe(true)
    expect(duration).toBeGreaterThan(200)
    expect(duration).toBeLessThan(3000)
  })

  it('overshoots when it is bouncy', () => {
    const { easing } = springEasing({ stiffness: 300, damping: 8 })
    const values = easing.slice(7, -1).split(', ').map(Number)
    expect(Math.max(...values)).toBeGreaterThan(1)
  })
})

describe('createFollower', () => {
  it('moves smoothly toward the target without jumping', () => {
    const follow = createFollower()
    const first = follow(1, 1 / 60)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(0.5)
    let value = first
    for (let i = 0; i < 60; i += 1) value = follow(1, 1 / 60)
    expect(value).toBeGreaterThan(0.95)
  })

  it('caps long frames so a stalled tab does not fling it', () => {
    const follow = createFollower()
    expect(follow(1, 5)).toBeLessThan(1.2)
  })
})

describe('playReaction and playMoodChange', () => {
  it('animate the right parts and layer on the idle loop', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    render(<Panda mood="idle" />)
    const svg = document.querySelector('svg.panda') as SVGSVGElement
    playReaction(svg, 'cheer')
    playReaction(svg, 'wiggle')
    playReaction(svg, 'nod')
    playMoodChange(svg)
    const classes = calls.map((call) => call.el.getAttribute('class'))
    expect(classes).toEqual(
      expect.arrayContaining(['pd-root', 'pd-shadow', 'pd-arm-l', 'pd-arm-r', 'pd-head', 'pd-eyes-open']),
    )
    expect(calls.every((call) => call.options.composite === 'add')).toBe(true)
    removeAnimate()
  })

  it('do nothing when the user prefers less motion', () => {
    mockReducedMotion(true)
    const calls = mockAnimate()
    render(<Panda mood="idle" />)
    playReaction(document.querySelector('svg.panda') as SVGSVGElement, 'hop')
    expect(calls).toHaveLength(0)
    removeAnimate()
  })
})

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

describe('changeMood', () => {
  it('switches the mood and blinks when it cannot measure poses', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    render(<Panda mood="idle" />)
    const svg = document.querySelector('svg.panda') as SVGSVGElement
    changeMood(svg, 'sleeping')
    expect(svg.dataset.mood).toBe('sleeping')
    expect(calls.some((call) => call.el.getAttribute('class') === 'pd-eyes-open')).toBe(true)
    removeAnimate()
  })

  it('carries the old pose into the new mood instead of jumping', () => {
    mockReducedMotion(false)
    vi.stubGlobal('DOMMatrix', FakeMatrix)
    const calls = mockAnimate()
    render(<Panda mood="confused" />)
    const svg = document.querySelector('svg.panda') as SVGSVGElement
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      const tilted = (el as Element).getAttribute('class') === 'pd-head' && svg.dataset.mood === 'confused'
      return { transform: tilted ? 'matrix(1, 0, 0, 1, 0, 10)' : 'none' } as CSSStyleDeclaration
    })
    changeMood(svg, 'idle')
    const bridge = calls.filter((call) => call.el.getAttribute('class') === 'pd-head' && call.keyframes.length === 2)
    const fromTilt = bridge.find((call) => call.keyframes[0].transform === 'matrix(1, 0, 0, 1, 0, 10)')
    expect(fromTilt?.keyframes[1].transform).toBe('matrix(1, 0, 0, 1, 0, 0)')
    expect(fromTilt?.options.composite).toBe('add')
    expect(calls.some((call) => call.el.getAttribute('class') === 'pd-root' && call.keyframes[0].transform?.toString().startsWith('matrix'))).toBe(false)
    vi.unstubAllGlobals()
    removeAnimate()
  })
})

describe('Panda', () => {
  it('is decorative unless it has a label', () => {
    const { rerender } = render(<Panda mood="idle" />)
    expect(document.querySelector('svg.panda')?.getAttribute('aria-hidden')).toBe('true')
    rerender(<Panda mood="idle" label="Ringpad's panda" />)
    expect(screen.getByRole('img', { name: "Ringpad's panda" })).toBeTruthy()
  })

  it('shows its mood and scales to the size it is given', () => {
    render(<Panda mood="sleeping" size={120} className="extra" />)
    const svg = document.querySelector('svg.panda') as SVGSVGElement
    expect(svg.dataset.mood).toBe('sleeping')
    expect(svg.getAttribute('width')).toBe('120')
    expect(svg.getAttribute('height')).toBe('134')
    expect(svg.getAttribute('class')).toBe('panda extra')
  })

  it('blinks into a new mood, plays cues and wiggles when poked', () => {
    mockReducedMotion(false)
    const calls = mockAnimate()
    const { rerender } = render(<Panda mood="idle" />)
    expect(calls).toHaveLength(0)
    rerender(<Panda mood="happy" />)
    expect(calls.some((call) => call.el.getAttribute('class') === 'pd-eyes-happy')).toBe(true)
    rerender(<Panda mood="happy" cue={{ kind: 'hop', id: 1 }} />)
    expect(calls.some((call) => call.el.getAttribute('class') === 'pd-root')).toBe(true)
    const before = calls.length
    fireEvent.click(document.querySelector('svg.panda') as SVGSVGElement)
    expect(calls.length).toBeGreaterThan(before)
    removeAnimate()
  })

  it('moves its mouth with the level while talking and stops when done', () => {
    mockReducedMotion(false)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const { rerender } = render(<Panda mood="talking" level={1} />)
    const mouth = document.querySelector('.pd-mouth-open') as SVGGElement
    act(() => {
      for (let i = 0; i < 20; i += 1) frames[frames.length - 1](performance.now() + i * 16)
    })
    expect(mouth.style.transform).toMatch(/^scaleY\(/)
    rerender(<Panda mood="idle" level={0} />)
    expect(cancel).toHaveBeenCalled()
    expect(mouth.style.transform).toBe('')
  })

  it('holds a still open mouth when motion is reduced', () => {
    mockReducedMotion(true)
    render(<Panda mood="talking" level={1} />)
    expect((document.querySelector('.pd-mouth-open') as SVGGElement).style.transform).toBe('scaleY(.7)')
  })

  it('looks toward the pointer', () => {
    mockReducedMotion(false)
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    render(<Panda mood="idle" />)
    fireEvent.pointerMove(window, { clientX: 400, clientY: 0 })
    act(() => frames.forEach((frame) => frame(0)))
    const look = document.querySelector('.pd-look') as SVGGElement
    expect(look.style.transform).toMatch(/^translate\(/)
  })
})
