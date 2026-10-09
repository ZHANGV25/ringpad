import { useEffect, useRef } from 'react'
import { drawWaveform } from './draw'

interface Props {
  peaks: number[]
  className?: string
  markerSeconds?: number
  historySeconds?: number
  label: string
}

export function WaveformCanvas({ peaks, className, markerSeconds, historySeconds, label }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) {
      return undefined
    }
    const draw = () => drawWaveform(canvas, peaks, { markerSeconds, historySeconds })
    draw()
    if (typeof ResizeObserver === 'undefined') {
      return undefined
    }
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [historySeconds, markerSeconds, peaks])

  return <canvas ref={ref} className={className} aria-label={label} />
}
