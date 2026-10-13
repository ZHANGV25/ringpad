import { useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClipInfo, Hotkeys, Meters, PadInfo, Playback, Settings } from '../../engine/types'
import { KeyChip, Sheet } from '../../components/controls'
import { PlayIcon, PlusIcon, SendIcon, StopIcon } from '../../components/icons'
import { Waveform } from '../../components/Waveform'
import { Panda } from '../../components/panda/Panda'
import { flyWaveform, landHere } from '../../lib/flight'
import { useEngine, useSignals } from '../../state/EngineProvider'
import { usePlayhead } from './usePlayhead'
import { useClipPanda } from './useClipPanda'

interface ClipCardProps {
  settings: Settings
  clip: ClipInfo | null
  playback: Playback
}

/**
 * The current clip, with the panda presenting it. A new clip visibly lifts out of the tape above
 * and lands here; while it plays, a playhead sweeps across it.
 */
export function ClipCard({ settings, clip, playback }: ClipCardProps) {
  const { api } = useEngine()
  const [saving, setSaving] = useState(false)
  const onAir = playback.sending && playback.pad == null
  return (
    <section className={`card clip-card ${onAir ? 'on-air' : ''}`} aria-label="Current clip">
      <div className="clip-stage">
        <ClipPanda />
        {clip ? (
          <ClipWave clip={clip} playing={(onAir || playback.previewing) && clip !== null} />
        ) : (
          <ol className="clip-howto" aria-label="How it works">
            <li>
              <KeyChip name={settings.hotkeys.grab} /> Clip what you just heard
            </li>
            <li>
              <KeyChip name={settings.hotkeys.send} /> Play it to your team
            </li>
          </ol>
        )}
      </div>
      {clip ? <ClipActions keys={settings.hotkeys} playback={playback} onAir={onAir} onSave={() => setSaving(true)} /> : null}
      {clip && playback.saveArmed ? (
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

interface ClipWaveProps {
  clip: ClipInfo
  playing: boolean
}

function ClipWave({ clip, playing }: ClipWaveProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLSpanElement>(null)
  const seen = useRef<string | null>(null)

  // A new clip flies in from the tape's clip band. The first one shown on opening does not.
  useLayoutEffect(() => {
    const first = seen.current === null
    seen.current = clip.id
    const target = wrap.current
    const band = document.querySelector('.tape-band')
    if (first || !target || !band) return
    landHere(target, flyWaveform(clip.peaks, band.getBoundingClientRect(), target.getBoundingClientRect()))
  }, [clip.id, clip.peaks])

  usePlayhead(head, playing, clip.seconds)

  return (
    <div className="clip-body">
      <div ref={wrap} className="clip-wave-wrap">
        <Waveform peaks={clip.peaks} className="clip-wave" label="Current clip waveform" />
        <span ref={head} className="playhead" aria-hidden="true" />
      </div>
      <span className="clip-length numeric">{clip.seconds.toFixed(1)} s</span>
    </div>
  )
}

interface ClipActionsProps {
  keys: Hotkeys
  playback: Playback
  onAir: boolean
  onSave: () => void
}

/** Who hears what is said under each button: preview is only you, send is everyone. Each shows its key. */
function ClipActions({ keys, playback, onAir, onSave }: ClipActionsProps) {
  const { api } = useEngine()
  return (
    <div className="clip-actions">
      <ClipAction
        label={playback.previewing ? 'Stop' : 'Preview'}
        icon={playback.previewing ? <StopIcon /> : <PlayIcon />}
        note="only you"
        tone="ghost"
        onPress={() => void (playback.previewing ? api.stopAll() : api.previewClip())}
      />
      <ClipAction
        label={onAir ? 'Stop' : 'Send'}
        icon={onAir ? <StopIcon /> : <SendIcon />}
        note={onAir ? 'on air' : 'your team'}
        hotkey={onAir ? keys.stop : keys.send}
        tone="primary"
        onPress={() => void (onAir ? api.stopAll() : api.sendClip())}
      />
      <ClipAction label="Save" icon={<PlusIcon />} note="to a pad" hotkey={keys.save} tone="" onPress={onSave} />
    </div>
  )
}

interface ClipActionProps {
  label: string
  icon: ReactNode
  note: string
  hotkey?: string | null
  tone: 'ghost' | 'primary' | ''
  onPress: () => void
}

/** A button named by what it does, with who hears it read out as its description. */
function ClipAction({ label, icon, note, hotkey, tone, onPress }: ClipActionProps) {
  const noteId = useId()
  return (
    <button type="button" className="clip-action" aria-label={label} aria-describedby={noteId} onClick={onPress}>
      <span className={tone ? `button ${tone}` : 'button'} aria-hidden="true">
        {icon} {label}
        {hotkey ? <KeyChip name={hotkey} /> : null}
      </span>
      <span id={noteId} className="clip-action-note">
        {note}
      </span>
    </button>
  )
}

const readOut = (meters: Meters) => meters.outgoing

/** Lives in its own component so the panda's mood changes re-render only the panda. */
function ClipPanda() {
  const { mood, cue } = useClipPanda()
  const { meters } = useSignals()
  return <Panda mood={mood} level={() => readOut(meters.get())} cue={cue} size={64} className="clip-panda" />
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
