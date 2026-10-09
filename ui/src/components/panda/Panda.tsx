import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PandaArt } from './PandaArt'
import { changeMood, createFollower, playReaction, reducedMotion } from './motion'
import type { PandaMood, PandaReaction } from './motion'
import '../../styles/panda.css'

export type { PandaMood, PandaReaction }

/** A one-shot move. Change `id` to play the same move again. */
export interface PandaCue {
  kind: PandaReaction
  id: number
}

interface PandaProps {
  mood: PandaMood
  /** Width in pixels. */
  size?: number
  /** Loudness from 0 to 1; the mouth follows it while talking. */
  level?: number
  cue?: PandaCue | null
  /** Accessible description. Without it the panda is decorative. */
  label?: string
  className?: string
}

const VIEW_W = 200
const VIEW_H = 224
const MAX_LOOK_PX = 2.6

/** Ringpad's panda. Breathes, blinks and glances on its own; reacts to the mood and cues it is given. */
export function Panda({ mood, size = 96, level = 0, cue = null, label, className }: PandaProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const levelRef = useRef(level)
  // React only sets the first mood. Later moods go through changeMood, which has to measure the
  // old pose before the attribute changes.
  const [firstMood] = useState(mood)

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (svg && svg.dataset.mood !== mood) changeMood(svg, mood)
  }, [mood])

  useEffect(() => {
    if (cue && svgRef.current) playReaction(svgRef.current, cue.kind)
  }, [cue])

  useTalking(svgRef, levelRef, mood === 'talking')
  useLookAtPointer(svgRef, mood !== 'sleeping')

  const poke = () => {
    if (svgRef.current) playReaction(svgRef.current, 'wiggle')
  }

  return (
    <svg
      ref={svgRef}
      className={className ? `panda ${className}` : 'panda'}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={size}
      height={Math.round((size * VIEW_H) / VIEW_W)}
      data-mood={firstMood}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      onClick={poke}
    >
      <PandaArt />
    </svg>
  )
}

/** While talking, a spring smooths the meter level into mouth and head motion every frame. */
function useTalking(svgRef: React.RefObject<SVGSVGElement | null>, levelRef: React.RefObject<number>, on: boolean) {
  useEffect(() => {
    const svg = svgRef.current
    if (!on || !svg) return
    const mouth = svg.querySelector<SVGGElement>('.pd-mouth-open')
    const head = svg.querySelector<SVGGElement>('.pd-head')
    if (reducedMotion() || typeof window.requestAnimationFrame !== 'function') {
      mouth?.style.setProperty('transform', 'scaleY(.7)')
      return () => mouth?.style.removeProperty('transform')
    }
    const follow = createFollower()
    let last = performance.now()
    let frame = window.requestAnimationFrame(function tick(now) {
      const open = Math.min(1, Math.max(0, follow(levelRef.current ?? 0, (now - last) / 1000)))
      last = now
      mouth?.style.setProperty('transform', `scaleY(${(0.22 + open * 0.85).toFixed(3)})`)
      head?.style.setProperty('transform', `translateY(${(-open * 2.4).toFixed(2)}px) rotate(${((open - 0.4) * 3).toFixed(2)}deg)`)
      frame = window.requestAnimationFrame(tick)
    })
    return () => {
      window.cancelAnimationFrame(frame)
      mouth?.style.removeProperty('transform')
      head?.style.removeProperty('transform')
    }
  }, [svgRef, levelRef, on])
}

/** The pupils turn a little toward the pointer, like the panda is watching you. */
function useLookAtPointer(svgRef: React.RefObject<SVGSVGElement | null>, on: boolean) {
  useEffect(() => {
    const svg = svgRef.current
    if (!on || !svg || reducedMotion() || typeof window.requestAnimationFrame !== 'function') return
    const looks = Array.from(svg.querySelectorAll<SVGGElement>('.pd-look'))
    let pending = 0
    const onMove = (event: PointerEvent) => {
      if (pending) return
      pending = window.requestAnimationFrame(() => {
        pending = 0
        const box = svg.getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height * 0.4)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, distance / 260)
        const x = (dx / distance) * reach * MAX_LOOK_PX
        const y = (dy / distance) * reach * MAX_LOOK_PX
        looks.forEach((look) => look.style.setProperty('transform', `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.cancelAnimationFrame(pending)
      looks.forEach((look) => look.style.removeProperty('transform'))
    }
  }, [svgRef, on])
}
