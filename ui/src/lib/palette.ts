/**
 * Colours for canvas drawing, read from the CSS tokens once and again only when the theme changes
 * (the user's choice or Windows switching to dark), never per frame.
 */
export interface Palette {
  strong: string
  muted: string
  faint: string
  surface: string
}

type Listener = () => void

const listeners = new Set<Listener>()
let cached: Palette | null = null
let watching = false

function read(): Palette {
  const styles = getComputedStyle(document.documentElement)
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
  return {
    strong: token('--text', '#0b0b0b'),
    muted: token('--text-muted', '#6b6b6b'),
    faint: token('--line-strong', '#c9c9c9'),
    surface: token('--surface', '#f4f4f4'),
  }
}

function changed(): void {
  cached = null
  listeners.forEach((listener) => listener())
}

function watch(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  if (typeof MutationObserver === 'function') {
    new MutationObserver(changed).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
  window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener?.('change', changed)
}

export function palette(): Palette {
  watch()
  cached ??= read()
  return cached
}

/** Calls `listener` after the theme changes. Returns the unsubscribe function. */
export function onPaletteChange(listener: Listener): () => void {
  watch()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
