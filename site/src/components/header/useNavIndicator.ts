'use client'

// The pill behind the header's links, after Brier's useNavIndicator.ts. The nav measures the link
// and writes its left edge and width to itself as custom properties (site.css `.nav-indicator`
// reads them). The pill follows the pointer across the links and goes back to the resting link
// when the pointer leaves; the resting link is the section crossing the middle of the viewport.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

// A band from 40% to 45% of the way down the viewport: the section crossing it is the current one.
const SPY_MARGIN = '-40% 0px -55% 0px'

export interface NavIndicator {
  readonly onEnter: (href: string) => void
  readonly onLeave: () => void
}

export function useNavIndicator(nav: RefObject<HTMLElement | null>, resting: string | null): NavIndicator {
  const [hovered, setHovered] = useState<string | null>(null)
  const target = hovered ?? resting

  useEffect(() => {
    const element = nav.current
    if (element === null) return
    const place = (): void => {
      const link = target === null ? null : element.querySelector<HTMLElement>(`a[href="${CSS.escape(target)}"]`)
      if (link === null) {
        element.style.setProperty('--nav-o', '0')
        return
      }
      element.style.setProperty('--nav-x', `${link.offsetLeft}px`)
      element.style.setProperty('--nav-w', `${link.offsetWidth}px`)
      element.style.setProperty('--nav-o', '1')
    }
    place()
    // Measure again once the web font has arrived and whenever the window resizes.
    void document.fonts.ready.then(place)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [nav, target])

  const onLeave = useCallback(() => setHovered(null), [])
  return { onEnter: setHovered, onLeave }
}

// The id of the section crossing the middle of the viewport, or null when none of them is.
export function useSectionSpy(ids: readonly string[]): string | null {
  const [current, setCurrent] = useState<string | null>(null)
  const visible = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const sections = ids.flatMap((id) => {
      const section = document.getElementById(id)
      return section === null ? [] : [section]
    })
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const next = new Set(visible.current)
        for (const entry of entries) {
          if (entry.isIntersecting) next.add(entry.target.id)
          else next.delete(entry.target.id)
        }
        visible.current = next
        setCurrent(ids.find((id) => next.has(id)) ?? null)
      },
      { rootMargin: SPY_MARGIN },
    )
    for (const section of sections) observer.observe(section)
    return () => {
      observer.disconnect()
      visible.current = new Set()
    }
  }, [ids])

  return current
}
