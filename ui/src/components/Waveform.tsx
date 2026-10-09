import { useEffect } from 'react'
import { fillBars, waveformBars } from './draw'
import { useCanvas } from './useCanvas'

interface Props {
  peaks: number[]
  className?: string
  label: string
  /** Draw in the muted colour (an empty or inactive look). */
  muted?: boolean
}

/** A fixed waveform (a clip, a pad). Redraws only when its peaks, size or the theme change. */
export function Waveform({ peaks, className, label, muted }: Props) {
  const { ref, invalidate } = useCanvas(({ context, width, height, dpr, colors }) => {
    fillBars(context, waveformBars(peaks, width / dpr, height / dpr, dpr), muted ? colors.muted : colors.strong)
  })
  useEffect(invalidate, [peaks, muted, invalidate])
  return <canvas ref={ref} className={className} role="img" aria-label={label} />
}
