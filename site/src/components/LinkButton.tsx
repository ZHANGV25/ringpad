// Brier's pill buttons (components/kit/Button.tsx), as links. Primary is the one ink pill on a
// light surface, light is its twin on the dark panels, outline and ghost sit beside them, and
// glass is the quiet second choice on a dark panel. A glyph says what the click does: ↓ for a
// download, ↗ for a page that opens in a new tab.
import type { ReactNode } from 'react'
import { cn } from './cn'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'light' | 'glass'
export type ButtonSize = 'md' | 'lg'
export type ButtonGlyph = 'download' | 'external'

// No display class here: a button that starts hidden (`hidden sm:inline-flex`) would lose to a
// base `inline-flex`, so displayClass adds it only when the caller sets no display of its own.
const BASE =
  'pill shrink-0 items-center justify-center gap-2 rounded-full border typ-body-x30 font-medium whitespace-nowrap no-underline press press-lg'

export function displayClass(className: string | undefined): string | undefined {
  return className !== undefined && /(^|\s)hidden(\s|$)/.test(className) ? undefined : 'inline-flex'
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'border-ink bg-ink text-on-ink hover:border-ink-hover hover:bg-ink-hover',
  outline: 'border-g300 bg-transparent text-ink hover:border-ink hover:bg-g100 active:bg-g200',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-g100 active:bg-g200',
  light: 'border-white bg-white text-black hover:border-white/85 hover:bg-white/85',
  glass: 'border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'h-9 px-4',
  lg: 'h-11 px-5',
}

interface GlyphProps {
  readonly glyph: ButtonGlyph
}

function Glyph({ glyph }: GlyphProps) {
  const path = glyph === 'download' ? 'M7 1.5v8.5M3.25 6.5 7 10.25l3.75-3.75M2.5 12.5h9' : 'M4.5 2.5h7v7M11.5 2.5l-9 9'
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

export interface LinkButtonProps {
  readonly href: string
  readonly children: ReactNode
  readonly variant?: ButtonVariant
  readonly size?: ButtonSize
  readonly glyph?: ButtonGlyph
  readonly className?: string
}

export function LinkButton({ href, children, variant = 'primary', size = 'md', glyph, className }: LinkButtonProps) {
  const external = glyph === 'external'
  return (
    <a
      href={href}
      className={cn(BASE, displayClass(className), VARIANTS[variant], SIZES[size], className)}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {children}
      {glyph ? <Glyph glyph={glyph} /> : null}
      {external ? <span className="sr-only"> (opens in a new tab)</span> : null}
    </a>
  )
}
