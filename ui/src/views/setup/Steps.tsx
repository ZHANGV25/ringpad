import { useEffect, useState } from 'react'
import type { Settings } from '../../engine/types'
import { CheckIcon } from '../../components/icons'
import { keyLabel } from '../../keys'
import { useEngine } from '../../state/EngineProvider'
import { CLICK_YES, InstallNote, VbCableCredit, useCableInstall } from '../CableInstall'
import { HotkeyRow } from '../SettingsHotkeys'

/** Installs VB-CABLE, the mic Ringpad plays into. Only shown when the PC has none. */
export function MicStep({ installed }: { installed: boolean }) {
  const { phase, start, busy } = useCableInstall()
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

/** After skipping the install there is nothing to pick yet. */
export function NoMicYet() {
  return (
    <>
      <h1>Use Ringpad’s mic</h1>
      <p className="lead">Add the mic first. Go back, or do it later in Settings.</p>
    </>
  )
}

/** The two keys, tried for real: each ticks itself off when it works. */
export function KeysStep({ settings }: { settings: Settings }) {
  const { clipped, sent } = useTried()
  const send = keyLabel(settings.hotkeys.send ?? '')
  return (
    <>
      <h1>Your keys</h1>
      <p className="lead">Try them now.</p>
      <div className="hotkey-list setup-keys">
        <HotkeyRow
          label="Clip"
          hint={clipped ? '✓ Got it. You heard it back.' : `Grabs the last ${settings.grabSeconds} seconds.`}
          target={{ kind: 'main', key: 'grab' }}
          value={settings.hotkeys.grab}
          clearable={false}
        />
        <HotkeyRow
          label="Send"
          hint={sent ? '✓ Your team heard it.' : clipped && send ? `Now press ${send}.` : 'Plays it to your team.'}
          target={{ kind: 'main', key: 'send' }}
          value={settings.hotkeys.send}
          clearable={false}
        />
      </div>
      <p className="hint">They work in games too.</p>
    </>
  )
}

/** Whether a clip was grabbed, and a clip sent, since this step opened. */
function useTried(): { clipped: boolean; sent: boolean } {
  const { state } = useEngine()
  const clipId = state.clip?.id ?? null
  const sending = state.playback.sending && state.playback.pad == null
  const [firstClip] = useState(clipId)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (sending) setSent(true)
  }, [sending])
  return { clipped: clipId !== null && clipId !== firstClip, sent }
}
