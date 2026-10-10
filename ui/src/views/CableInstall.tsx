import { useState } from 'react'
import type { EngineApi } from '../engine/api'
import type { CableInstall, DeviceInfo } from '../engine/types'
import { useEngine } from '../state/EngineProvider'

export const VB_CABLE_URL = 'https://vb-audio.com/Cable/'

type Phase =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'stopped'; outcome: Exclude<CableInstall, 'installed'> }
  | { kind: 'failed'; message: string }

const STOPPED_NOTES: Record<Exclude<CableInstall, 'installed'>, string> = {
  declined: 'Windows needs a Yes. Try again.',
  needsRestart: 'Restart your PC to finish.',
}

/** Said before the click: Windows' prompt dims the screen, so the app can't explain it while it shows. */
export const CLICK_YES = 'Windows will ask. Click Yes.'

/** Installs the VB-CABLE that ships with Ringpad, then plays clips into it. */
export function useCableInstall() {
  const { api } = useEngine()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const start = () => {
    setPhase({ kind: 'installing' })
    install(api).then(setPhase, (error: unknown) =>
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) }),
    )
  }
  return { phase, start, busy: phase.kind === 'installing' }
}

async function install(api: EngineApi): Promise<Phase> {
  const outcome = await api.installVirtualMic()
  if (outcome !== 'installed') return { kind: 'stopped', outcome }
  const cable = playbackSide(await api.listDevices())
  if (cable) await api.updateSettings({ patch: { virtualOutput: cable.id } })
  return { kind: 'idle' }
}

/** VB-CABLE's playback side ("CABLE Input"), the one Ringpad plays into. */
export function playbackSide(devices: DeviceInfo[]): DeviceInfo | undefined {
  const outputs = devices.filter((device) => device.direction === 'output' && device.virtualCable === 'vbcable')
  return outputs.find((device) => /cable input/i.test(device.name)) ?? outputs[0]
}

/** No cable at all: offer the bundled one. */
export function NoCableCallout() {
  const { api } = useEngine()
  const { phase, start, busy } = useCableInstall()
  return (
    <div className="callout" aria-busy={busy}>
      <strong>No virtual mic yet</strong>
      <span className="hint">Ringpad plays clips through a virtual mic. It comes with a free one, VB-CABLE.</span>
      <div className="row-actions">
        <button type="button" className="button small primary" disabled={busy} onClick={start}>
          {busy ? 'Installing…' : 'Install VB-CABLE'}
        </button>
        <button type="button" className="button small" disabled={busy} onClick={() => void api.listDevices()}>
          Check again
        </button>
      </div>
      <span className="hint">{CLICK_YES}</span>
      <InstallNote phase={phase} />
      <VbCableCredit />
    </div>
  )
}

/** Another cable is in use (say Voicemod's): VB-CABLE stays one click away. */
export function SwitchToVbCable() {
  const { phase, start, busy } = useCableInstall()
  return (
    <div className="cable-switch">
      <button type="button" className="link-button small" disabled={busy} onClick={start}>
        {busy ? 'Installing VB-CABLE…' : 'Install VB-CABLE instead'}
      </button>
      <InstallNote phase={phase} />
      {phase.kind === 'idle' ? null : <VbCableCredit />}
    </div>
  )
}

/** What came of the last try. Empty while installing: the button says so. */
export function InstallNote({ phase }: { phase: Phase }) {
  let note = ''
  if (phase.kind === 'stopped') note = STOPPED_NOTES[phase.outcome]
  if (phase.kind === 'failed') note = phase.message
  return (
    <span className="hint" role="status">
      {note}
    </span>
  )
}

/**
 * VB-Audio's terms ask that people can see whose software this is and that it takes donations.
 * `inText` drops the small print styling for use inside a paragraph.
 */
export function VbCableCredit({ inText = false }: { inText?: boolean }) {
  const { api } = useEngine()
  return (
    <span className={inText ? undefined : 'credit'}>
      VB-CABLE is made by VB-Audio. VB-CABLE is a donationware, all participations are welcome:{' '}
      <button type="button" className="link-button" onClick={() => void api.openExternal({ url: VB_CABLE_URL })}>
        www.vb-cable.com
      </button>
    </span>
  )
}
