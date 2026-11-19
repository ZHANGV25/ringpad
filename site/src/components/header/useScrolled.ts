'use client'

// Marks <html> with data-scrolled once the page has scrolled 8px, so the header can turn into its
// frosted capsule from CSS alone (site.css `.site-capsule`). Brier's shell/useScrolled.tsx.
import { useEffect } from 'react'

const SCROLLED_AFTER_PX = 8
const ATTRIBUTE = 'data-scrolled'

export function useScrolled(): void {
  useEffect(() => {
    const html = document.documentElement
    const update = (): void => {
      if (window.scrollY > SCROLLED_AFTER_PX) html.setAttribute(ATTRIBUTE, '')
      else html.removeAttribute(ATTRIBUTE)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update)
      html.removeAttribute(ATTRIBUTE)
    }
  }, [])
}
