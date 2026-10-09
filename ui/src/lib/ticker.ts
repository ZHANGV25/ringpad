import { isCalm, onCalm } from './calm'

/**
 * One animation-frame loop for everything that draws from live data (meters, waveforms). Jobs run
 * in the same frame, so a meter update and a waveform update cost one frame, not two. The loop
 * only runs while some job wants another frame; with nothing changing it requests none at all.
 * In calm mode (Ringpad not in use) it slows to a few frames a second.
 *
 * A job gets the frame time and the seconds since the last frame it ran in, and returns true to
 * run again next frame (a meter still falling) or false when it has nothing left to do.
 */
export type Job = (now: number, dt: number) => boolean

const CALM_FRAME_MS = 250
/** Never integrate more than this, so a stalled frame does not fling anything. */
const MAX_DT = 0.1

const jobs = new Set<Job>()
let handle: number | null = null
let viaTimer = false
let last = 0
let stopListening: (() => void) | null = null

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function request(): void {
  if (handle !== null) return
  if (!stopListening) {
    // Leaving calm mode should not wait out a slow timer.
    stopListening = onCalm((calm) => {
      if (!calm && handle !== null && viaTimer) {
        window.clearTimeout(handle)
        handle = null
        if (jobs.size > 0) request()
      }
    })
  }
  viaTimer = isCalm() || typeof window.requestAnimationFrame !== 'function'
  if (viaTimer) {
    handle = window.setTimeout(() => frame(now()), isCalm() ? CALM_FRAME_MS : 16)
  } else {
    handle = window.requestAnimationFrame(frame)
  }
}

function frame(time: number): void {
  handle = null
  const dt = last === 0 ? 1 / 60 : Math.min(MAX_DT, Math.max(0, (time - last) / 1000))
  last = time
  for (const job of [...jobs]) {
    let again = false
    try {
      again = job(time, dt)
    } catch {
      again = false
    }
    if (!again) jobs.delete(job)
  }
  if (jobs.size > 0) request()
  else last = 0
}

/** Runs `job` in the next frame (once, unless it asks to continue). Scheduling twice is harmless. */
export function schedule(job: Job): void {
  jobs.add(job)
  request()
}

export function unschedule(job: Job): void {
  jobs.delete(job)
}

/** For tests: drop every job and any pending frame. */
export function resetTicker(): void {
  jobs.clear()
  if (handle !== null) {
    if (viaTimer) window.clearTimeout(handle)
    else window.cancelAnimationFrame(handle)
  }
  handle = null
  last = 0
  stopListening?.()
  stopListening = null
}
