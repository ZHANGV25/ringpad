import type { Settings } from '../../engine/types'
import { Slider } from '../../components/controls'
import { Meter } from '../../components/Meter'
import { keyLabel } from '../../keys'
import { useEngine, useMeters } from '../../state/EngineProvider'

interface FooterProps {
  settings: Settings
}

export function Footer({ settings }: FooterProps) {
  const { api, state } = useEngine()
  const meters = useMeters()
  const holding = state.talk.holding.map(keyLabel).join(' + ')
  const showMic = settings.micMode !== 'open'
  return (
    <footer className="footer">
      <div className="meters">
        <Meter label="Source" value={meters.source} />
        <Meter label="Mic" value={meters.mic} />
        <Meter label="Out" value={meters.outgoing} />
      </div>
      {showMic || holding ? (
        <div className="talk-status">
          {showMic ? <span className={`status-chip ${state.talk.micOpen ? 'filled' : 'outline'}`}>{state.talk.micOpen ? 'Mic on' : 'Mic off'}</span> : null}
          {holding ? <span className="status-chip outline">Holding {holding}</span> : null}
        </div>
      ) : null}
      {state.talk.blocked ? (
        <span className="meter-error" role="alert">
          {state.talk.blocked}
        </span>
      ) : null}
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
