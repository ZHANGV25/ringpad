import { useState } from 'react'
import type { DeviceInfo, Meters, Settings } from '../engine/types'
import { LevelMeter } from '../components/LevelMeter'
import { BackIcon, CheckIcon } from '../components/icons'
import { Panda } from '../components/panda/Panda'
import type { PandaMood } from '../components/panda/Panda'
import { reducedMotion } from '../components/panda/motion'
import { useEngine, useMeterSelector, useSignals } from '../state/EngineProvider'
import { SourcePicker, VirtualMicPicker } from './SettingsAudio'
import { HotkeyRow } from './SettingsHotkeys'

interface Props {
  onFinish: () => void
}

const STEP_COUNT = 4
/** About one hop of the celebrate loop before the main window takes over. */
const CELEBRATE_MS = 900
/** Outgoing level above which the test tone counts as playing. */
const TALK_LEVEL = 0.02
const CABLE_NAMES: Record<string, string> = {
  vbcable: 'VB-CABLE',
  voicemod: 'Voicemod',
  voicemeeter: 'VoiceMeeter',
  other: 'a virtual cable',
}

export function FirstRun({ onFinish }: Props) {
  const { api, state } = useEngine()
  const [step, setStep] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const settings = state.settings
  if (!settings) {
    return null
  }
  const last = step === STEP_COUNT - 1
  const finish = () => {
    setFinishing(true)
    const done = () => void api.updateSettings({ patch: { firstRunDone: true } }).then(onFinish)
    if (reducedMotion()) done()
    else window.setTimeout(done, CELEBRATE_MS)
  }
  const skipping = step === 0 && !hasCable(state.devices)
  const nextLabel = last ? 'Start using Ringpad' : skipping ? 'Skip for now' : 'Continue'
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
        <SetupGuide step={step} settings={settings} cableFound={hasCable(state.devices)} finishing={finishing} />
        {step === 0 ? <CableStep settings={settings} /> : null}
        {step === 1 ? <TestStep /> : null}
        {step === 2 ? <RecordStep settings={settings} /> : null}
        {step === 3 ? <KeysStep settings={settings} /> : null}
      </div>
      <footer className="wizard-actions">
        <button type="button" className="button ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
          <BackIcon /> Back
        </button>
        <button
          type="button"
          className={skipping ? 'button' : 'button primary'}
          disabled={finishing}
          onClick={() => (last ? finish() : setStep((value) => value + 1))}
        >
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
      {cable?.virtualCable ? (
        <span className="found">
          <CheckIcon /> Found {CABLE_NAMES[cable.virtualCable] ?? 'a virtual cable'}
        </span>
      ) : null}
      <VirtualMicPicker settings={settings} />
    </>
  )
}

const readOut = (meters: Meters) => meters.outgoing

function TestStep() {
  const { api } = useEngine()
  return (
    <>
      <div className="tone-test">
        <button type="button" className="button primary" onClick={() => void api.playTestTone()}>
          Play test tone
        </button>
        <LevelMeter label="Teammates hear" read={readOut} />
      </div>
    </>
  )
}

function RecordStep({ settings }: { settings: Settings }) {
  return <SourcePicker settings={settings} />
}

function KeysStep({ settings }: { settings: Settings }) {
  return (
    <>
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

interface SetupGuideProps {
  step: number
  settings: Settings
  cableFound: boolean
  finishing: boolean
}

/** The panda and its speech bubble. Its own component so meter updates re-render only this. */
function SetupGuide({ step, settings, cableFound, finishing }: SetupGuideProps) {
  const { meters } = useSignals()
  const toneOn = useMeterSelector((levels) => levels.outgoing > TALK_LEVEL)
  const intro = stepIntro(step, settings)
  const mood = setupMood(step, { cableFound, finishing, toneOn })
  return (
    <div className="setup-guide">
      <Panda mood={mood} level={() => readOut(meters.get())} size={80} />
      <div className="bubble" key={step}>
        <h1>{intro.title}</h1>
        <p>{intro.body}</p>
      </div>
    </div>
  )
}

/** Happy when things work, puzzled when the cable is missing, talking while the test tone plays. */
export function setupMood(step: number, seen: { cableFound: boolean; finishing: boolean; toneOn: boolean }): PandaMood {
  if (seen.finishing) return 'celebrate'
  if (step === 0) return seen.cableFound ? 'happy' : 'confused'
  if (step === 1) return seen.toneOn ? 'talking' : 'idle'
  if (step === 2) return 'listening'
  return 'happy'
}

function stepIntro(step: number, settings: Settings): { title: string; body: string } {
  if (step === 0) {
    return {
      title: 'Your virtual mic',
      body: 'Ringpad plays clips into a virtual cable. Your game hears the other end of it as a microphone.',
    }
  }
  if (step === 1) {
    return { title: 'Test it', body: 'Play a short tone into the virtual mic. The meter should move; teammates would hear the tone.' }
  }
  if (step === 2) {
    return {
      title: 'What to record',
      body: `Ringpad keeps the last ${settings.historySeconds} s of this in memory, ready to clip. Nothing is saved until you clip.`,
    }
  }
  return { title: 'Your keys', body: 'They work while you play, even with the game focused. Change any of them here or later in Settings.' }
}

function hasCable(devices: DeviceInfo[]): boolean {
  return devices.some((device) => device.direction === 'output' && Boolean(device.virtualCable))
}
