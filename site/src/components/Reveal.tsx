'use client'

// Holds its pictures back until a fifth of it has scrolled into view, then lets them rise in, once
// (site.css `[data-reveal]`). Brier's PictureReveal.tsx. Under reduced motion the CSS keeps
// everything still, so the attribute changes nothing.
import { useEffect, useRef, useState, type ReactNode } from 'react'

const THRESHOLD = 0.2

type RevealTag = 'div' | 'ol'

interface RevealProps {
  readonly as?: RevealTag
  readonly className?: string
  readonly children: ReactNode
}

export function Reveal({ as: Tag = 'div', className, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const [state, setState] = useState<'wait' | 'play'>('wait')

  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('play')
          observer.disconnect()
        }
      },
      { threshold: THRESHOLD },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref as never} data-reveal={state} className={className}>
      {children}
    </Tag>
  )
}
