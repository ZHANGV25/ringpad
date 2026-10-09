import type { Meters, Settings } from '../../engine/types'
import { LevelMeter } from '../../components/LevelMeter'
import { Slider } from '../../components/controls'
import { keyLabel } from '../../keys'
import { useEngine } from '../../state/EngineProvider'

interface FooterProps {
  settings: Settings
}

const readOut = (meters: Meters) => meters.outgoing

/**
 * What your teammates hear: one meter for everything going into the virtual mic (your voice and
 * clips), whether the mic is open, and how loud clips are for them.
 */
export function Footer({ settings }: FooterProps) {
  const { api, state } = useEngine()
  const holding = state.talk.holding.map(keyLabel).join(' + ')
  const showMic = settings.micMode !== 'open'
  return (
    <footer className="footer">
      <div className="footer-head">
        <span className="label">Teammates hear</span>
        <span className="talk-status">
          {showMic ? <span className={`status-chip ${state.talk.micOpen ? 'filled' : 'outline'}`}>{state.talk.micOpen ? 'Mic on' : 'Mic off'}</span> : null}
          {holding ? <span className="status-chip outline">Holding {holding}</span> : null}
        </span>
      </div>
      <LevelMeter label="What teammates hear" read={readOut} className="out-meter" />
      {state.talk.blocked ? (
        <span className="meter-error" role="alert">
          {state.talk.blocked}
        </span>
      ) : null}
      <Slider
        label="Clip volume"
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
