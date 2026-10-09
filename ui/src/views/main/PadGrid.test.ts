import { describe, expect, it } from 'vitest'
import { padsHint } from './PadGrid'

describe('padsHint', () => {
  it('says what a click on a pad will do right now', () => {
    expect(padsHint(0, false)).toBe('Keep your best clips here')
    expect(padsHint(0, true)).toBe('Click a pad to keep this clip')
    expect(padsHint(3, true)).toBe('Click an empty pad to keep the clip')
    expect(padsHint(3, false)).toBe('Click a pad or press its key')
  })
})
