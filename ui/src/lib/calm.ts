/**
 * Calm mode: when Ringpad's window is not the one you are using (a game has focus, or the window
 * is hidden), every looping animation pauses so the window draws nothing at all. A window covered
 * by a borderless game still renders, so focus is the only reliable signal. One-shot feedback,
 * such as a mood change after a hotkey, still plays; it ends on its own.
 *
 * Sets `data-calm` on <html> (styles/app.css pauses CSS animations under it) and tells subscribers.
 */

const CALM_AFTER_MS = 3000

type Listener = (calm: boolean) => void

const listeners = new Set<Listener>()
let calm = false
let timer: number | undefined
let started = false

function set(next: boolean): void {
  if (next === calm) return
  calm = next
  if (next) document.documentElement.dataset.calm = ''
  else delete document.documentElement.dataset.calm
  listeners.forEach((listener) => listener(next))
}

function update(): void {
  window.clearTimeout(timer)
  if (document.visibilityState === 'hidden') {
    set(true)
    return
  }
  if (document.hasFocus()) {
    set(false)
    return
  }
  timer = window.setTimeout(() => set(true), CALM_AFTER_MS)
}

function start(): void {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('focus', update)
  window.addEventListener('blur', update)
  document.addEventListener('visibilitychange', update)
  update()
}

export function isCalm(): boolean {
  start()
  return calm
}

/** Calls `listener` whenever calm mode turns on or off. Returns the unsubscribe function. */
export function onCalm(listener: Listener): () => void {
  start()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** For tests: forget everything and stop listening. */
export function resetCalm(): void {
  window.clearTimeout(timer)
  window.removeEventListener('focus', update)
  window.removeEventListener('blur', update)
  document.removeEventListener('visibilitychange', update)
  listeners.clear()
  started = false
  calm = false
  delete document.documentElement.dataset.calm
}
