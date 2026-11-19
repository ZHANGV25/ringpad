// The Ringpad panda (docs/brand/ringpad-icon.svg), drawn without its grey tile so it sits on
// paper like Brier's mark does, and the wordmark set in the display face.

interface RingpadMarkProps {
  readonly size?: number
  readonly tile?: boolean
}

export function RingpadMark({ size = 24, tile = false }: RingpadMarkProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" width={size} height={size} className="shrink-0">
      {tile ? <rect x="4" y="4" width="192" height="192" rx="44" fill="#dcdcdc" /> : null}
      <g transform={tile ? 'translate(100 106) scale(1.02) translate(-100 -88)' : 'translate(100 100) scale(1.16) translate(-100 -88)'}>
        <circle cx="50" cy="45" r="22" fill="#0b0b0b" />
        <circle cx="150" cy="45" r="22" fill="#0b0b0b" />
        <path
          fill="#ffffff"
          stroke="#0b0b0b"
          strokeWidth={tile ? 0 : 7}
          d="M100 28 C140 28 168 53 168 89 C168 124 139 148 100 148 C61 148 32 124 32 89 C32 53 60 28 100 28 Z"
        />
        <ellipse cx="72" cy="94" rx="18" ry="23" transform="rotate(34 72 94)" fill="#0b0b0b" />
        <ellipse cx="128" cy="94" rx="18" ry="23" transform="rotate(-34 128 94)" fill="#0b0b0b" />
        <circle cx="76" cy="89" r="11" fill="#ffffff" />
        <circle cx="77.5" cy="90" r="6.6" fill="#0b0b0b" />
        <circle cx="80.2" cy="87.2" r="2.5" fill="#ffffff" />
        <circle cx="124" cy="89" r="11" fill="#ffffff" />
        <circle cx="122.5" cy="90" r="6.6" fill="#0b0b0b" />
        <circle cx="125.2" cy="87.2" r="2.5" fill="#ffffff" />
        <path fill="#0b0b0b" d="M91.5 110 C95 106.8 105 106.8 108.5 110 C108 115.4 103.2 118.4 100 118.9 C96.8 118.4 92 115.4 91.5 110 Z" />
        <g fill="none" stroke="#0b0b0b" strokeWidth="3.2" strokeLinecap="round">
          <path d="M100 118.9 V122.5" />
          <path d="M91.5 121.5 C94.5 126.5 100 126 100 122.5 C100 126 105.5 126.5 108.5 121.5" />
        </g>
      </g>
    </svg>
  )
}

interface WordmarkProps {
  readonly onClick?: () => void
}

export function Wordmark({ onClick }: WordmarkProps) {
  return (
    <a href="#top" onClick={onClick} className="inline-flex items-center gap-2 text-ink no-underline">
      <RingpadMark size={26} />
      <span className="display text-[19px]">Ringpad</span>
    </a>
  )
}
