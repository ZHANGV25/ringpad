import { describe, expect, it } from 'vitest'
import { padsHint } from './PadGrid'

describe('padsHint', () => {
  it('says how to play a pad, since empty pads say what a click does', () => {
    expect(padsHint(0)).toBe('Fill a pad, then press its key')
    expect(padsHint(3)).toBe('Click a pad or press its key')
  })
})
