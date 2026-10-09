import { useState } from 'react'
import type { PadInfo } from '../../engine/types'
import { Sheet, Slider } from '../../components/controls'
import { TrashIcon } from '../../components/icons'
import { useEngine } from '../../state/EngineProvider'
import { HotkeyRow } from '../SettingsHotkeys'

interface PadSheetProps {
  pad: PadInfo
  slot: number
  close: () => void
}

/** Rename, volume, hotkey and clear for one pad. */
export function PadSheet({ pad, slot, close }: PadSheetProps) {
  const { api } = useEngine()
  const [name, setName] = useState(pad.name)
  const [confirming, setConfirming] = useState(false)
  const rename = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== pad.name) void api.renamePad({ slot, name: trimmed })
  }
  return (
    <Sheet title={`Pad ${slot + 1}`} onClose={close}>
      <label className="field">
        <span className="label">Name</span>
        <input
          type="text"
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === 'Enter') rename()
          }}
        />
      </label>
      <Slider
        label="Volume"
        value={pad.volume}
        min={0}
        max={1}
        step={0.01}
        percent
        onChange={(volume) => void api.setPadVolume({ slot, volume })}
      />
      <div className="hotkey-list">
        <HotkeyRow label="Hotkey" target={{ kind: 'pad', slot }} value={pad.hotkey} />
      </div>
      <span className="hint">To replace the sound, drop an audio file on the pad.</span>
      <div className="sheet-actions">
        {confirming ? (
          <>
            <span className="hint">Clear this pad?</span>
            <button type="button" className="button small primary" onClick={() => void api.clearPad({ slot }).then(close)}>
              Clear
            </button>
            <button type="button" className="button small" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button small" onClick={() => setConfirming(true)}>
              <TrashIcon /> Clear pad
            </button>
            <button type="button" className="button small primary" onClick={close}>
              Done
            </button>
          </>
        )}
      </div>
    </Sheet>
  )
}
