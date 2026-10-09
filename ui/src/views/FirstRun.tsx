import { useState } from 'react'
import type { DeviceInfo, Settings } from '../engine/types'
import { Meter } from '../components/Meter'
import { BackIcon, CheckIcon } from '../components/icons'
import { useEngine, useMeters } from '../state/EngineProvider'
import { SourcePicker, VirtualMicPicker } from './SettingsAudio'
import { HotkeyRow } from './SettingsHotkeys'

interface Props {
  onFinish: () => void
}

const STEP_COUNT = 4
const CABLE_NAMES: Record<string, string> = {
  vbcable: 'VB-CABLE',
  voicemod: 'Voicemod',
  voicemeeter: 'VoiceMeeter',
  other: 'a virtual cable',
}

export function FirstRun({ onFinish }: Props) {
  const { api, state } = useEngine()
  const [step, setStep] = useState(0)
  const settings = state.settings
  if (!settings) {
    return null
  }
  const last = step === STEP_COUNT - 1
  const finish = () => void api.updateSettings({ patch: { firstRunDone: true } }).then(onFinish)
  const nextLabel = last ? 'Start using Ringpad' : step === 0 && !hasCable(state.devices) ? 'Skip for now' : 'Continue'
  return (
    <main className="setup-shell">
      <header className="setup-head">
        <div className="row">
          <span className="title">Set up Ringpad</span>
          <span className="muted small numeric">
            {step + 1} of {STEP_COUNT}
          </span>
        </div>
        <div className="steps" aria-hidden="true">
          {Array.from({ length: STEP_COUNT }, (_, index) => (
            <span key={index} className={index <= step ? 'done' : ''} />
          ))}
        </div>
      </header>
      <div className="setup-body">
        {step === 0 ? <CableStep settings={settings} /> : null}
        {step === 1 ? <TestStep /> : null}
        {step === 2 ? <RecordStep settings={settings} /> : null}
        {step === 3 ? <KeysStep settings={settings} /> : null}
      </div>
      <footer className="wizard-actions">
        <button type="button" className="button ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
          <BackIcon /> Back
        </button>
        <button type="button" className="button primary" onClick={() => (last ? finish() : setStep((value) => value + 1))}>
          {nextLabel}
        </button>
      </footer>
    </main>
  )
}

function CableStep({ settings }: { settings: Settings }) {
  const { state } = useEngine()
  const cable = state.devices.find((device) => device.direction === 'output' && device.virtualCable)
  return (
    <>
      <div className="setup-intro">
        <h1>Your virtual mic</h1>
        <p>Ringpad plays clips into a virtual cable. Your game hears the other end of it as a microphone.</p>
      </div>
      {cable?.virtualCable ? (
        <span className="found">
          <CheckIcon /> Found {CABLE_NAMES[cable.virtualCable] ?? 'a virtual cable'}
        </span>
      ) : null}
      <VirtualMicPicker settings={settings} />
    </>
  )
}

function TestStep() {
  const { api } = useEngine()
  const meters = useMeters()
  return (
    <>
      <div className="setup-intro">
        <h1>Test it</h1>
        <p>Play a short tone into the virtual mic. The meter should move; teammates would hear the tone.</p>
      </div>
      <div className="tone-test">
        <button type="button" className="button primary" onClick={() => void api.playTestTone()}>
          Play test tone
        </button>
        <Meter label="Out" value={meters.outgoing} />
      </div>
    </>
  )
}

function RecordStep({ settings }: { settings: Settings }) {
  return (
    <>
      <div className="setup-intro">
        <h1>What to record</h1>
        <p>Ringpad keeps the last {settings.historySeconds} s of this in memory, ready to clip. Nothing is saved until you clip.</p>
      </div>
      <SourcePicker settings={settings} />
    </>
  )
}

function KeysStep({ settings }: { settings: Settings }) {
  return (
    <>
      <div className="setup-intro">
        <h1>Your keys</h1>
        <p>They work while you play, even with the game focused. Change any of them here or later in Settings.</p>
      </div>
      <div className="hotkey-list">
        <HotkeyRow label="Clip" hint={`Grab the last ${settings.grabSeconds} s, preview it to you`} target={{ kind: 'main', key: 'grab' }} value={settings.hotkeys.grab} />
        <HotkeyRow label="Send" hint="Play the clip to everyone" target={{ kind: 'main', key: 'send' }} value={settings.hotkeys.send} />
        <HotkeyRow label="Send, second key" hint="Handy on a mouse button" target={{ kind: 'main', key: 'sendAlt' }} value={settings.hotkeys.sendAlt} />
        <HotkeyRow label="Stop" hint="Stop anything playing" target={{ kind: 'main', key: 'stop' }} value={settings.hotkeys.stop} />
        <HotkeyRow label="Save to pad" hint="Then press a pad key" target={{ kind: 'main', key: 'save' }} value={settings.hotkeys.save} />
      </div>
    </>
  )
}

function hasCable(devices: DeviceInfo[]): boolean {
  return devices.some((device) => device.direction === 'output' && Boolean(device.virtualCable))
}
