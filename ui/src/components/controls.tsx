import { useEffect, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { keyLabel } from '../keys'

interface IconButtonProps {
  label: string
  children: ReactNode
  onClick: () => void
  pressed?: boolean
  className?: string
}

export function IconButton({ label, children, onClick, pressed, className }: IconButtonProps) {
  return (
    <button
      className={`icon-button ${className ?? ''}`}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface SegmentedProps<T extends string> {
  label: string
  options: readonly T[]
  value: T
  labels: Record<T, string>
  onChange: (value: T) => void
  variant?: 'segmented' | 'tabs'
}

/** One choice among a few; arrow keys move the choice. Renders as a pill group or as tabs. */
export function Segmented<T extends string>({ label, options, value, labels, onChange, variant = 'segmented' }: SegmentedProps<T>) {
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return
    }
    event.preventDefault()
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const index = options.indexOf(value)
    const next = options[(index + delta + options.length) % options.length]
    if (next) {
      onChange(next)
    }
  }
  return (
    <div className={variant} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="tab"
          aria-selected={value === option}
          tabIndex={value === option ? 0 : -1}
          onClick={() => onChange(option)}
        >
          {labels[option]}
        </button>
      ))}
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  label: string
  hint?: string
  onChange: (checked: boolean) => void
}

/** A labelled on/off switch. */
export function Toggle({ checked, label, hint, onChange }: ToggleProps) {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span>{label}</span>
        {hint ? <span className="hint">{hint}</span> : null}
      </span>
      <input
        className="switch"
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  percent?: boolean
  suffix?: string
}

/** A labelled range with its value shown in tabular numbers. */
export function Slider({ label, value, min, max, step, onChange, percent, suffix = '' }: SliderProps) {
  const shown = percent ? `${Math.round(value * 100)}%` : `${value}${suffix}`
  const fill = ((value - min) / (max - min || 1)) * 100
  const style = { '--pct': `${fill}%` } as CSSProperties
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span className="numeric">{shown}</span>
    </label>
  )
}

interface KeyChipProps {
  name: string | null | undefined
  faint?: boolean
  capturing?: boolean
}

/** A hotkey drawn as a keycap. */
export function KeyChip({ name, faint, capturing }: KeyChipProps) {
  if (capturing) {
    return <span className="key-chip capturing">Press a key</span>
  }
  const text = name ? keyLabel(name) : 'None'
  return (
    <span className={`key-chip ${faint || !name ? 'faint' : ''}`} title={text}>
      {text}
    </span>
  )
}

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** A panel that slides over the bottom of the window; Escape or a click outside closes it. */
export function Sheet({ title, onClose, children }: SheetProps) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <button type="button" className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <section className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <span className="title">{title}</span>
        </div>
        {children}
      </section>
    </>
  )
}
