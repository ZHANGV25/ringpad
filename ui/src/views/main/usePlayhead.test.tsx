import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { usePlayhead } from './usePlayhead'

interface Made {
  keyframes: Keyframe[]
  options: KeyframeAnimationOptions
  cancel: ReturnType<typeof vi.fn>
}

let made: Made[] = []

beforeEach(() => {
  made = []
  window.matchMedia = vi.fn(() => ({ matches: false })) as never
  Element.prototype.animate = vi.fn(function animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = { keyframes, options, cancel: vi.fn() }
    made.push(animation)
    return animation as unknown as Animation
  }) as never
})

afterEach(() => {
  cleanup()
  delete (Element.prototype as Partial<Element>).animate
  delete (window as Partial<Window>).matchMedia
})

function Head({ playing, seconds }: { playing: boolean; seconds: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  usePlayhead(ref, playing, seconds)
  return <span ref={ref} data-testid="head" />
}

describe('usePlayhead', () => {
  it('sweeps once across the whole sound in one linear animation', () => {
    render(<Head playing seconds={2.5} />)
    expect(made).toHaveLength(1)
    expect(made[0].keyframes).toEqual([
      { transform: 'translateX(-100%)', opacity: 1 },
      { transform: 'translateX(0)', opacity: 1 },
    ])
    expect(made[0].options).toMatchObject({ duration: 2500, easing: 'linear' })
  })

  it('fades out where it stopped', () => {
    const view = render(<Head playing seconds={2} />)
    view.rerender(<Head playing={false} seconds={2} />)
    expect(made[0].cancel).toHaveBeenCalled()
    expect(made[1].keyframes).toHaveLength(2)
    expect(made[1].keyframes[1]).toMatchObject({ opacity: 0 })
  })

  it('does nothing for an empty sound', () => {
    render(<Head playing seconds={0} />)
    expect(made).toHaveLength(0)
  })

  it('shows a still marker instead of moving when motion is reduced', () => {
    window.matchMedia = vi.fn(() => ({ matches: true })) as never
    const view = render(<Head playing seconds={2} />)
    const head = view.getByTestId('head')
    expect(made).toHaveLength(0)
    expect(head.className).toBe('playing-still')
    view.rerender(<Head playing={false} seconds={2} />)
    expect(head.className).toBe('')
  })
})
