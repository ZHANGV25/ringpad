import type { Settings } from '../../engine/types'
import { Slider } from '../../components/controls'
import { Meter } from '../../components/Meter'
import { useEngine, useMeters } from '../../state/EngineProvider'

interface FooterProps {
  settings: Settings
}

export function Footer({ settings }: FooterProps) {
  const { api } = useEngine()
  const meters = useMeters()
  return (
    <footer className="footer">
      <div className="meters">
        <Meter label="Source" value={meters.source} />
        <Meter label="Mic" value={meters.mic} />
        <Meter label="Out" value={meters.outgoing} />
      </div>
      <Slider
        label="Others hear"
        value={settings.sendVolume}
        min={0}
        max={1}
        step={0.01}
        percent
        onChange={(sendVolume) => void api.updateSettings({ patch: { sendVolume } })}
      />
    </footer>
  )
}
