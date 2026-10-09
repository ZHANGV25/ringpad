import { useState } from 'react'
import type { ClipInfo, PadInfo, Playback, Settings } from '../../engine/types'
import { KeyChip, Sheet } from '../../components/controls'
import { PlayIcon, PlusIcon, SendIcon, StopIcon } from '../../components/icons'
import { WaveformCanvas } from '../../components/WaveformCanvas'
import { useEngine } from '../../state/EngineProvider'

interface ClipCardProps {
  settings: Settings
  clip: ClipInfo | null
  playback: Playback
}

export function ClipCard({ settings, clip, playback }: ClipCardProps) {
  const { api } = useEngine()
  const [saving, setSaving] = useState(false)
  if (!clip) {
    return (
      <section className="card clip-card" aria-label="Current clip">
        <div className="clip-empty">
          <span className="clip-empty-title">No clip yet</span>
          <span className="muted">
            Press <KeyChip name={settings.hotkeys.grab} /> to clip the last {settings.grabSeconds} s
          </span>
        </div>
      </section>
    )
  }
  return (
    <section className={`card clip-card ${playback.sending ? 'sending' : ''}`} aria-label="Current clip">
      <WaveformCanvas peaks={clip.peaks} className="clip-wave" label="Current clip waveform" />
      <div className="clip-row">
        <div className="clip-length">
          <strong>{clip.seconds.toFixed(1)} s</strong>
          <span className="muted small">{playback.sending ? 'Sending' : playback.previewing ? 'Previewing' : 'Current clip'}</span>
        </div>
        <button type="button" className="button small ghost" onClick={() => void api.previewClip()}>
          <PlayIcon /> Preview
        </button>
        <button
          type="button"
          className="button small primary"
          onClick={() => void (playback.sending ? api.stopAll() : api.sendClip())}
        >
          {playback.sending ? <StopIcon /> : <SendIcon />}
          {playback.sending ? 'Stop' : 'Send'}
        </button>
        <button type="button" className="button small" onClick={() => setSaving(true)}>
          <PlusIcon /> Save
        </button>
      </div>
      {playback.saveArmed ? (
        <div className="save-armed" role="status">
          <span>Press a pad key to save this clip</span>
          <button type="button" className="link-button" onClick={() => void api.stopAll()}>
            Cancel
          </button>
        </div>
      ) : null}
      {saving ? <SaveSheet close={() => setSaving(false)} /> : null}
    </section>
  )
}

interface SaveSheetProps {
  close: () => void
}

function SaveSheet({ close }: SaveSheetProps) {
  const { api, state } = useEngine()
  return (
    <Sheet title="Save clip to a pad" onClose={close}>
      <div className="pad-picker">
        {state.pads.map((pad, slot) => (
          <button key={slot} type="button" onClick={() => void api.saveClipToPad({ slot }).then(close)}>
            <span className="slot-number">{slot + 1}</span>
            <span className="slot-name">{padLabel(pad)}</span>
          </button>
        ))}
      </div>
      <span className="hint">Saving over a pad replaces its sound.</span>
    </Sheet>
  )
}

function padLabel(pad: PadInfo | null): string {
  return pad ? pad.name : 'Empty'
}
