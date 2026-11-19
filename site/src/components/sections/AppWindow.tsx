// The Ringpad window as Windows 11 draws it: a light title bar with the app's name at the left and
// the three caption buttons at the right, around whatever the window shows.
import type { ReactNode } from 'react'
import { cn } from '../cn'
import { RingpadMark } from '../RingpadMark'

const CAPTION_PATHS: readonly string[] = ['M0.5 5h9', 'M1 1h8v8H1z', 'M1 1l8 8M9 1l-8 8']

interface AppWindowProps {
  readonly children: ReactNode
  readonly className?: string
}

export function AppWindow({ children, className }: AppWindowProps) {
  return (
    <div className={cn('app-window', className)}>
      <div aria-hidden="true" className="flex h-8 items-center justify-between border-b border-g200 bg-[#f3f3f3]">
        <span className="flex items-center gap-2 pl-3 text-[12px] leading-4 text-g500">
          <RingpadMark size={14} />
          Ringpad
        </span>
        <span className="flex h-full">
          {CAPTION_PATHS.map((d) => (
            <span key={d} className="flex h-full w-10 items-center justify-center text-g500">
              <svg viewBox="0 0 10 10" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1">
                <path d={d} />
              </svg>
            </span>
          ))}
        </span>
      </div>
      {children}
    </div>
  )
}
