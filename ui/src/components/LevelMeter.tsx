import { useEffect, useRef } from 'react'
import type { Meters } from '../engine/types'
import { schedule, unschedule } from '../lib/ticker'
import { useSignals } from '../state/EngineProvider'

/** The meter shows the top 60 dB; quieter is empty. */
const RANGE_DB = 60
/** Like a broadcast peak meter: rises instantly, falls at a steady rate, holds the peak a moment. */
const FALL_PER_S = 20 / RANGE_DB
const PEAK_HOLD_MS = 1200
const PEAK_FALL_PER_S = 30 / RANGE_DB
const ARIA_EVERY_MS = 500

/** Position from 0 to 1 for a linear peak level, on a decibel scale like the ear hears it. */
export function meterPosition(level: number): number {
  if (!(level > 0)) return 0
  return Math.min(1, Math.max(0, (20 * Math.log10(level) + RANGE_DB) / RANGE_DB))
}

interface Props {
  label: string
  /** Picks this meter's level; keep it a stable function (defined outside the component). */
  read: (meters: Meters) => number
  className?: string
}

/**
 * A level meter that never re-renders: it reads the meter store and writes two transforms in the
 * shared frame (lib/ticker), and stops asking for frames once it has fallen still.
 */
export function LevelMeter({ label, read, className }: Props) {
  const { meters } = useSignals()
  const root = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const peak = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let shown = 0
    let held = 0
    let heldAt = 0
    let ariaAt = 0
    let level = -1
    let moving = false
    let drawn = ''
    let spoken = '0'
    const job = (now: number, dt: number) => {
      const target = meterPosition(read(meters.get()))
      shown = target >= shown ? target : Math.max(target, shown - FALL_PER_S * dt)
      if (shown >= held) {
        held = shown
        heldAt = now
      } else if (now - heldAt > PEAK_HOLD_MS) {
        held = Math.max(shown, held - PEAK_FALL_PER_S * dt)
      }
      const fillAt = `scaleX(${shown.toFixed(4)})`
      const peakAt = `translateX(${(held * 100).toFixed(2)}%)`
      if (fillAt + peakAt !== drawn) {
        drawn = fillAt + peakAt
        if (fill.current) fill.current.style.transform = fillAt
        if (peak.current) {
          peak.current.style.transform = peakAt
          peak.current.style.opacity = held > 0.01 ? '1' : '0'
        }
      }
      moving = shown > target + 0.0005 || held > shown + 0.0005
      // Screen readers get the level twice a second, and the last one when the meter comes to rest.
      const value = String(Math.round(target * 100))
      if (value !== spoken && (!moving || now - ariaAt > ARIA_EVERY_MS) && root.current) {
        ariaAt = now
        spoken = value
        root.current.setAttribute('aria-valuenow', value)
      }
      return moving
    }
    // A level that has not changed, on a meter at rest, needs no frame at all.
    const off = meters.subscribe((next) => {
      const value = read(next)
      if (value === level && !moving) return
      level = value
      schedule(job)
    })
    return () => {
      off()
      unschedule(job)
    }
  }, [meters, read])

  return (
    <div
      ref={root}
      className={className ? `level-meter ${className}` : 'level-meter'}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={0}
    >
      <span ref={fill} className="level-fill" />
      <span className="level-peak-track">
        <span ref={peak} className="level-peak" />
      </span>
    </div>
  )
}
