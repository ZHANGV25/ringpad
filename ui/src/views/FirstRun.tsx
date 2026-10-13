import { useEffect, useState } from 'react'
import type { DeviceInfo } from '../engine/types'
import { BackIcon } from '../components/icons'
import { Panda } from '../components/panda/Panda'
import type { PandaCue } from '../components/panda/Panda'
import { isCalm } from '../lib/calm'
import { useEngine } from '../state/EngineProvider'
import { PickMicStep, hearsRingpad, useMicUsers } from './setup/PickMic'
import { KeysStep, MicStep, NoMicYet } from './setup/Steps'

interface Props {
  onFinish: () => void
}

type Step = 'mic' | 'pick' | 'keys'

/** The panda waves on arrival, then again every so often while the title screen is open. */
const FIRST_WAVE_MS = 450
const WAVE_EVERY_MS = 7000

export function FirstRun({ onFinish }: Props) {
  const { api, state } = useEngine()
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [index, setIndex] = useState(0)
  const step = steps?.[index] ?? null
  const users = useMicUsers(step === 'pick')
  const settings = state.settings
  if (!settings) {
    return null
  }
  if (!steps || !step) {
    // A PC that already has a virtual mic skips straight to picking it.
    const start = () => {
      setIndex(0)
      setSteps(hasCable(state.devices) ? ['pick', 'keys'] : ['mic', 'pick', 'keys'])
    }
    return <Welcome onStart={start} />
  }
  const cableIn = hasCable(state.devices)
  const finish = () => void api.updateSettings({ patch: { firstRunDone: true } }).then(onFinish)
  // Moving on before it works is allowed, but it isn't the main action.
  const skipping = (step === 'mic' && !cableIn) || (step === 'pick' && cableIn && !hearsRingpad(users))
  const next = () => {
    if (step === 'keys') finish()
    // Skipping the mic skips picking it too.
    else setIndex(step === 'mic' && !cableIn ? steps.indexOf('keys') : index + 1)
  }
  return (
    <main className="setup-shell">
      <div className="steps" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((name, at) => (
          <span key={name} className={at <= index ? 'done' : ''} />
        ))}
      </div>
      <div className="setup-body">
        {step === 'mic' ? <MicStep installed={cableIn} /> : null}
        {step === 'pick' ? cableIn ? <PickMicStep settings={settings} users={users} /> : <NoMicYet /> : null}
        {step === 'keys' ? <KeysStep settings={settings} /> : null}
      </div>
      <footer className="wizard-actions">
        <button type="button" className="button ghost" onClick={() => (index === 0 ? setSteps(null) : setIndex(index - 1))}>
          <BackIcon /> Back
        </button>
        <button type="button" className={skipping ? 'button' : 'button primary'} onClick={next}>
          {step === 'keys' ? 'Done' : skipping ? 'Skip for now' : 'Next'}
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

function hasCable(devices: DeviceInfo[]): boolean {
  return devices.some((device) => device.direction === 'output' && Boolean(device.virtualCable))
}
