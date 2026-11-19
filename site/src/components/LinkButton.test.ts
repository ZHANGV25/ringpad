import { describe, expect, it } from 'vitest'
import { cn } from './cn'
import { displayClass } from './LinkButton'

describe('displayClass', () => {
  it('shows the pill as inline-flex by default', () => {
    expect(displayClass(undefined)).toBe('inline-flex')
    expect(displayClass('mt-6 w-full')).toBe('inline-flex')
  })

  it('leaves the display to a caller that hides the pill at some widths', () => {
    expect(displayClass('hidden sm:inline-flex')).toBeUndefined()
    expect(displayClass('w-full hidden')).toBeUndefined()
  })

  it('is not fooled by classes that only contain the word', () => {
    expect(displayClass('overflow-hidden')).toBe('inline-flex')
  })
})

describe('cn', () => {
  it('joins the classes it is given and skips the empty ones', () => {
    expect(cn('a', false, undefined, 'b', null, '')).toBe('a b')
  })
})
