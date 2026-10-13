import type { Meters, Settings, SettingsPatch, TalkState } from '../engine/types'
import { Toggle } from '../components/controls'
import { LevelMeter } from '../components/LevelMeter'
import { useEngine } from '../state/EngineProvider'
import { NoCableCallout } from './CableInstall'
import { VirtualMicPicker } from './SettingsAudio'
import { GameTalkKey, MicModeControls } from './SettingsTalk'
import { MicGuide, useMicUsers } from './setup/PickMic'

interface MicTabProps {
  settings: Settings
  talk: TalkState
}

const readOut = (meters: Meters) => meters.outgoing

/** What your team hears: the mic to pick in your app, a test, your own voice, and the game's talk key. */
export function MicTab({ settings, talk }: MicTabProps) {
  const { api, state } = useEngine()
  const hasCable = state.devices.some((device) => device.direction === 'output' && Boolean(device.virtualCable))
  const cableIsDefault = state.devices.some((device) => device.direction === 'output' && device.isDefault && Boolean(device.virtualCable))
  const users = useMicUsers(hasCable)
  return (
    <>
      <section className="group">
        <span className="label">In Discord or your game</span>
        {hasCable ? <MicGuide settings={settings} users={users} /> : <NoCableCallout />}
        {cableIsDefault ? (
          <p className="check wrong" role="alert">
            Windows is playing all sound into Ringpad’s mic, so you hear nothing. Set your Windows sound output back to your
            headphones.
          </p>
        ) : null}
      </section>
      <section className="group">
        <span className="label">Test</span>
        <div className="test-row">
          <button type="button" className="button small" onClick={() => void api.playTestTone()}>
            Play a test sound
          </button>
          <LevelMeter label="What your team hears" read={readOut} className="test-meter" />
        </div>
      </section>
      <section className="group">
        <span className="label">Your voice</span>
        <YourVoice settings={settings} />
      </section>
      <section className="group">
        <span className="label">Game talk key</span>
        <GameTalkKey settings={settings} talk={talk} />
      </section>
      {hasCable ? (
        <section className="group">
          <details className="more">
            <summary>Virtual cable</summary>
            <div className="more-body">
              <VirtualMicPicker settings={settings} />
            </div>
          </details>
        </section>
      ) : null}
    </>
  )
}

/** Your own mic goes out on Ringpad's mic too, so one mic in Discord carries both. */
function YourVoice({ settings }: { settings: Settings }) {
  const { api, state } = useEngine()
  const update = (patch: SettingsPatch) => void api.updateSettings({ patch })
  const inputs = state.devices.filter((device) => device.direction === 'input' && !device.virtualCable)
  return (
    <>
      <Toggle checked={settings.micEnabled} label="Send my voice too" hint="Your team hears you and the clips." onChange={(micEnabled) => update({ micEnabled })} />
      {settings.micEnabled ? (
        <>
          <select aria-label="Mic device" value={settings.mic ?? ''} onChange={(event) => update({ mic: event.currentTarget.value || null })}>
            <option value="">Default mic</option>
            {inputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <MicModeControls settings={settings} />
          <Toggle
            checked={settings.ducking}
            label="Quiet my mic during clips"
            hint="So it doesn't pick the clip up from your headphones."
            onChange={(ducking) => update({ ducking })}
          />
        </>
      ) : null}
    </>
  )
}
