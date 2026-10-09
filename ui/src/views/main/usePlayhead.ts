import { useEffect } from 'react'
import type { RefObject } from 'react'
import { reducedMotion } from '../../components/panda/motion'

/**
 * Sweeps a playhead across a waveform while it plays. One linear transform animation for the
 * whole sound, so the compositor moves it and the page does no work per frame. The element is as
 * wide as the waveform and slides in from the left: a playhead draws its line on its right edge
 * (main.css), a pad's fill is a plain tint.
 */
export function usePlayhead(
  ref: RefObject<HTMLElement | null>,
  playing: boolean,
  seconds: number,
): void {
  useEffect(() => {
    const head = ref.current
    if (!playing || !head || typeof head.animate !== 'function' || seconds <= 0) return undefined
    if (reducedMotion()) {
      head.classList.add('playing-still')
      return () => head.classList.remove('playing-still')
    }
    const sweep = head.animate(
      [
        { transform: 'translateX(-100%)', opacity: 1 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: seconds * 1000, easing: 'linear', fill: 'forwards' },
    )
    return () => {
      // Fade out where it stopped rather than vanish.
      const at = getComputedStyle(head).transform
      sweep.cancel()
      head.animate([{ transform: at, opacity: 1 }, { transform: at, opacity: 0 }], { duration: 180, easing: 'ease-out' })
    }
  }, [ref, playing, seconds])
}
