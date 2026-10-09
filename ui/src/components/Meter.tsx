import { useEffect, useState } from 'react'

interface Props {
  label: string
  value: number
}

export function Meter({ label, value }: Props) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const [peak, setPeak] = useState(percent)

  useEffect(() => {
    setPeak((current) => Math.max(current, percent))
  }, [percent])

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPeak(percent)
      return undefined
    }
    const timer = window.setInterval(() => setPeak((current) => Math.max(percent, current - 2)), 80)
    return () => window.clearInterval(timer)
  }, [percent])

  return (
    <div className="meter-block">
      <span className="label">{label}</span>
      <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span className="meter-fill" style={{ width: `${percent}%` }} />
        <span className="meter-peak" style={{ left: `${peak}%` }} />
      </div>
    </div>
  )
}
