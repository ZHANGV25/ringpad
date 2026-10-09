import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { DEFAULT_SETTINGS } from '../../engine/types'
import { EngineProvider } from '../../state/EngineProvider'
import { resetTicker } from '../../lib/ticker'
import { makeApi } from '../../test/render'
import { Tape } from './Tape'

interface Glide {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
}

let glides: Glide[] = []
let fills: number[] = []

function fakeContext(): CanvasRenderingContext2D {
  let rects = 0
  return {
    clearRect: vi.fn(),
    beginPath: () => {
      rects = 0
    },
    rect: () => {
      rects += 1
    },
    fill: () => fills.push(rects),
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D
}

function reduceMotion(on: boolean) {
  window.matchMedia = vi.fn((query: string) => ({ matches: on && query.includes('reduce') })) as never
}

beforeEach(() => {
  glides = []
  fills = []
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(fakeContext as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 310, height: 48 } as DOMRect)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  reduceMotion(false)
  Element.prototype.animate = vi.fn(function animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const glide = { keyframes, options, cancel: vi.fn() }
    glides.push(glide)
    return glide as unknown as Animation
  }) as never
})

afterEach(() => {
  resetTicker()
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (Element.prototype as Partial<Element>).animate
  delete (window as Partial<Window>).matchMedia
})

function renderTape() {
  const api = makeApi()
  const settings = { ...DEFAULT_SETTINGS, historySeconds: 30, grabSeconds: 5 }
  const view = render(
    <EngineProvider api={api}>
      <Tape settings={settings} />
    </EngineProvider>,
  )
  const canvas = view.container.querySelector('canvas') as HTMLCanvasElement
  return { api, canvas, view }
}

function arrive(api: ReturnType<typeof makeApi>, peaks: number[], after = 100) {
  act(() => {
    api.simulateLive(peaks)
    vi.advanceTimersByTime(after)
  })
}

const peaks = (count: number) => Array.from({ length: count }, (_, i) => (i % 7) / 7)

describe('live tape', () => {
  it('shows what a clip takes and how much it keeps', () => {
    const { view } = renderTape()
    expect(view.getByText('5 s')).toBeTruthy()
    expect(view.getByText('Last 30 s')).toBeTruthy()
    expect(view.getByRole('img', { name: 'The last 30 seconds of audio' })).toBeTruthy()
    const section = view.container.querySelector('.tape') as HTMLElement
    expect(section.style.getPropertyValue('--slots')).toBe('301')
    expect(Number(section.style.getPropertyValue('--share'))).toBeCloseTo(5 / 30)
  })

  it('redraws on each arrival and glides one step until the next', () => {
    const { api, canvas } = renderTape()
    arrive(api, peaks(301))
    // Older bars faint; the 50 bars a 5 s clip takes in the strong colour.
    expect(fills.slice(-2)).toEqual([251, 50])
    expect(glides).toHaveLength(1)
    const [glide] = glides
    expect(glide.keyframes).toEqual([{ transform: 'translateX(0)' }, { transform: canvas.style.transform }])
    expect(canvas.style.transform).toMatch(/^translateX\(-[\d.]+px\)$/)
    expect(glide.options).toMatchObject({ easing: 'linear', duration: 100 })

    arrive(api, peaks(301))
    expect(glides[0].cancel).toHaveBeenCalled()
    expect(glides).toHaveLength(2)
  })

  it('times the glide to how often data actually arrives', () => {
    const { api } = renderTape()
    for (let i = 0; i < 12; i += 1) arrive(api, peaks(40), 200)
    const last = glides[glides.length - 1].options.duration as number
    expect(last).toBeGreaterThan(180)
    expect(last).toBeLessThanOrEqual(200)
  })

  it('steps without gliding when motion is reduced', () => {
    reduceMotion(true)
    const { api, canvas } = renderTape()
    arrive(api, peaks(40))
    expect(glides).toHaveLength(0)
    expect(canvas.style.transform).toMatch(/^translateX\(-/)
    expect(fills.length).toBeGreaterThan(0)
  })

  it('grabs a clip from its button', () => {
    const { api, view } = renderTape()
    const grab = vi.spyOn(api, 'grabClip')
    act(() => view.getByRole('button', { name: /^Clip/ }).click())
    expect(grab).toHaveBeenCalledOnce()
  })
})
