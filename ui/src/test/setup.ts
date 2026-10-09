import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom has no canvas; drawing code already skips a missing 2D context.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
  vi.useRealTimers()
  vi.restoreAllMocks()
})
