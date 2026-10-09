import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { resetCalm } from '../lib/calm'
import { resetTicker } from '../lib/ticker'

// jsdom has no canvas; drawing code already skips a missing 2D context.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext

afterEach(() => {
  cleanup()
  // Module state shared by every test: the frame loop and calm mode.
  resetTicker()
  resetCalm()
  document.documentElement.removeAttribute('data-theme')
  vi.useRealTimers()
  vi.restoreAllMocks()
})
