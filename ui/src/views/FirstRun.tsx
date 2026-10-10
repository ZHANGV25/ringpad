import { useEffect, useState } from 'react'
import type { DeviceInfo, Meters, Settings } from '../engine/types'
import { LevelMeter } from '../components/LevelMeter'
import { BackIcon, CheckIcon } from '../components/icons'
import { Panda } from '../components/panda/Panda'
import type { PandaCue } from '../components/panda/Panda'
import { isCalm } from '../lib/calm'
import { useEngine } from '../state/EngineProvider'
import { CLICK_YES, InstallNote, VbCableCredit, useCableInstall } from './CableInstall'
import { HotkeyRow } from './SettingsHotkeys'

interface Props {
  onFinish: () => void
}

type Step = 'mic' | 'pick' | 'keys'

/** The panda waves on arrival, then again every so often while the title screen is open. */
const FIRST_WAVE_MS = 450
const WAVE_EVERY_MS = 7000
/** What Windows calls VB-CABLE's mic, for when the engine hasn't said yet. */
const CABLE_MIC = 'CABLE Output (VB-Audio Virtual Cable)'

export function FirstRun({ onFinish }: Props) {
  const { api, state } = useEngine()
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [index, setIndex] = useState(0)
  const settings = state.settings
  if (!settings) {
    return null
  }
  if (!steps) {
    // A PC that already has a virtual mic skips straight to picking it.
    const start = () => {
      setIndex(0)
      setSteps(hasCable(state.devices) ? ['pick', 'keys'] : ['mic', 'pick', 'keys'])
    }
    return <Welcome onStart={start} />
  }
  const step = steps[index]
  const cableIn = hasCable(state.devices)
  const finish = () => void api.updateSettings({ patch: { firstRunDone: true } }).then(onFinish)
  // Skipping the mic skips picking it too.
  const skipMic = step === 'mic' && !cableIn
  const next = () => {
    if (step === 'keys') finish()
    else setIndex(skipMic ? steps.indexOf('keys') : index + 1)
  }
  return (
    <main className="setup-shell">
      <div className="steps" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((name, at) => (
          <span key={name} className={at <= index ? 'done' : ''} />
        ))}
      </div>
      <div className="setup-body">
        {step === 'mic' ? <MicStep /> : null}
        {step === 'pick' ? <PickStep settings={settings} cableIn={cableIn} /> : null}
        {step === 'keys' ? <KeysStep settings={settings} /> : null}
      </div>
      <footer className="wizard-actions">
        <button type="button" className="button ghost" onClick={() => (index === 0 ? setSteps(null) : setIndex(index - 1))}>
          <BackIcon /> Back
        </button>
        <button type="button" className={skipMic ? 'button' : 'button primary'} onClick={next}>
          {step === 'keys' ? 'Done' : skipMic ? 'Skip' : 'Next'}
        </button>
      </footer>
    </main>
  )
}

/** The title screen: the panda says hello by waving. */
function Welcome({ onStart }: { onStart: () => void }) {
  const [cue, setCue] = useState<PandaCue | null>(null)
  useEffect(() => {
    let id = 0
    const wave = () => {
      if (!isCalm()) setCue({ kind: 'wave', id: ++id })
    }
    const first = window.setTimeout(wave, FIRST_WAVE_MS)
    const again = window.setInterval(wave, WAVE_EVERY_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(again)
    }
  }, [])
  return (
    <main className="setup-shell">
      <div className="welcome">
        <Panda mood="idle" size={132} cue={cue} label="Ringpad's panda, waving" />
        <h1>Ringpad</h1>
        <p>Clip what you just heard. Play it to your team.</p>
      </div>
      <footer className="wizard-actions">
        <button type="button" className="button primary block" onClick={onStart}>
          Start
        </button>
      </footer>
    </main>
  )
}

function MicStep() {
  const { state } = useEngine()
  const { phase, start, busy } = useCableInstall()
  const installed = hasCable(state.devices)
  return (
    <>
      <h1>Add the mic</h1>
      <p className="lead">Ringpad plays clips through a free mic called VB-CABLE.</p>
      {installed ? (
        <span className="found">
          <CheckIcon /> Installed
        </span>
      ) : (
        <div className="setup-action">
          <button type="button" className="button primary block" disabled={busy} onClick={start}>
            {busy ? 'Installing…' : 'Install VB-CABLE'}
          </button>
          <span className="hint">{CLICK_YES}</span>
          <InstallNote phase={phase} />
        </div>
      )}
      <VbCableCredit />
    </>
  )
}

const readOut = (meters: Meters) => meters.outgoing

function PickStep({ settings, cableIn }: { settings: Settings; cableIn: boolean }) {
  const { api, state } = useEngine()
  if (!cableIn) {
    return (
      <>
        <h1>Pick the mic</h1>
        <p className="lead">Add the mic first. Go back, or do it later in Settings.</p>
      </>
    )
  }
  return (
    <>
      <h1>Pick the mic</h1>
      <p className="lead">In Discord or your game, set your mic to:</p>
      <p className="mic-name">{state.virtualCaptureHint ?? CABLE_MIC}</p>
      <dl className="where">
        <dt>Discord</dt>
        <dd>
          Settings › Voice &amp; Video › Input Device
          {/* Both treat clips as background noise and cut them. */}
          <span>Same page: turn off Noise Suppression and Echo Cancellation.</span>
        </dd>
        <dt>Valorant</dt>
        <dd>
          Settings › Audio › Voice Chat › Input Device
          <span>Hold your talk key while a clip plays.</span>
        </dd>
      </dl>
      {settings.micEnabled ? <p className="lead">Your friends still hear your voice.</p> : null}
      <div className="tone-test">
        <button type="button" className="button" onClick={() => void api.playTestTone()}>
          Play a test sound
        </button>
        <LevelMeter label="Teammates hear" read={readOut} />
      </div>
    </>
  )
}

function KeysStep({ settings }: { settings: Settings }) {
  return (
    <>
      <h1>Your keys</h1>
      <div className="hotkey-list">
        <HotkeyRow
          label="Clip"
          hint={`Grab the last ${settings.grabSeconds} seconds`}
          target={{ kind: 'main', key: 'grab' }}
          value={settings.hotkeys.grab}
          clearable={false}
        />
        <HotkeyRow
          label="Send"
          hint="Play it to your team"
          target={{ kind: 'main', key: 'send' }}
          value={settings.hotkeys.send}
          clearable={false}
        />
      </div>
      <p className="hint">They work in games too. More keys are in Settings.</p>
    </>
  )
}

function hasCable(devices: DeviceInfo[]): boolean {
  return devices.some((device) => device.direction === 'output' && Boolean(device.virtualCable))
}
