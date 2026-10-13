import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { DEFAULT_PAD_HOTKEYS, type ClipInfo, type PadInfo, type Playback } from '../../engine/types'
import { IconButton, KeyChip } from '../../components/controls'
import { MoreIcon, PlusIcon } from '../../components/icons'
import { Waveform } from '../../components/Waveform'
import { reducedMotion } from '../../components/panda/motion'
import { flyWaveform, landHere } from '../../lib/flight'
import { useEngine } from '../../state/EngineProvider'
import { PadSheet } from './PadSheet'
import { gainedSound } from './useClipPanda'
import { usePlayhead } from './usePlayhead'

interface PadGridProps {
  pads: Array<PadInfo | null>
  clip: ClipInfo | null
  playback: Playback
  dragSlot: number | null
}

/**
 * Pads as keycaps, like a sampler. A pad presses down when it plays (by click or by its key) and
 * fills as it plays. An empty pad takes the current clip when clicked, or asks for a sound file
 * when there is none; a saved clip visibly drops into its pad.
 */
export function PadGrid({ pads, clip, playback, dragSlot }: PadGridProps) {
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const menuPad = menuSlot === null ? null : (pads[menuSlot] ?? null)
  useSavedFlight(pads)
  const filled = pads.filter(Boolean).length
  return (
    <section className="pads" aria-label="Pads">
      <div className="pads-head">
        <span className="label">Pads</span>
        <span className="muted small">{padsHint(filled)}</span>
      </div>
      <div className="pad-grid">
        {pads.map((pad, slot) => (
          <PadKey
            key={slot}
            pad={pad}
            slot={slot}
            canTakeClip={clip !== null}
            dragging={dragSlot === slot}
            playing={playback.sending && playback.pad === slot}
            onMenu={() => setMenuSlot(slot)}
          />
        ))}
      </div>
      {menuSlot !== null && menuPad ? <PadSheet pad={menuPad} slot={menuSlot} close={() => setMenuSlot(null)} /> : null}
    </section>
  )
}

/** Empty pads say what a click does, so the hint only says how to play one. */
export function padsHint(filled: number): string {
  return filled === 0 ? 'Fill a pad, then press its key' : 'Click a pad or press its key'
}

interface PadKeyProps {
  pad: PadInfo | null
  slot: number
  canTakeClip: boolean
  dragging: boolean
  playing: boolean
  onMenu: () => void
}

function PadKey({ pad, slot, canTakeClip, dragging, playing, onMenu }: PadKeyProps) {
  const { api } = useEngine()
  const hotkey = pad?.hotkey ?? DEFAULT_PAD_HOTKEYS[slot] ?? null
  const cap = useRef<HTMLButtonElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  usePlayhead(fill, playing, pad?.seconds ?? 0)
  usePressWhenPlayed(cap, playing)

  const press = () => {
    if (pad) void api.playPad({ slot })
    else if (canTakeClip) void api.saveClipToPad({ slot })
    else void api.pickSoundFile().then((path) => (path ? api.importPad({ slot, path }) : null))
  }
  const name = dragging ? 'Drop here' : (pad?.name ?? (canTakeClip ? 'Save clip' : 'Add sound'))
  const label = pad ? `Play ${pad.name}` : canTakeClip ? `Save the clip to pad ${slot + 1}` : `Add a sound to pad ${slot + 1}`
  const state = pad ? 'filled' : canTakeClip ? 'empty open' : 'empty'
  return (
    <div
      className={`pad-key ${state} ${playing ? 'playing' : ''} ${dragging ? 'drop-target' : ''}`}
      data-slot={slot}
      onContextMenu={(event) => {
        if (!pad) return
        event.preventDefault()
        onMenu()
      }}
    >
      <button
        ref={cap}
        type="button"
        className="pad-cap"
        aria-label={label}
        title={pad ? `${pad.name} (right-click for options)` : canTakeClip ? 'Save the clip here' : 'Pick a sound file, or drop one here'}
        onClick={press}
      >
        <span className="pad-fill" ref={fill} aria-hidden="true" />
        <span className="pad-top">
          {hotkey ? <KeyChip name={hotkey} faint={!pad} /> : <span className="pad-slot numeric">{slot + 1}</span>}
        </span>
        <span className="pad-face">{pad ? <Waveform peaks={pad.peaks} className="pad-wave" label={`${pad.name} waveform`} /> : <PlusIcon />}</span>
        <span className="pad-name">{name}</span>
      </button>
      {pad ? (
        <IconButton label={`${pad.name} options`} className="pad-more" onClick={onMenu}>
          <MoreIcon />
        </IconButton>
      ) : null}
    </div>
  )
}

/** A pad played from the keyboard presses down on screen too, so you see which one went. */
function usePressWhenPlayed(ref: RefObject<HTMLElement | null>, playing: boolean) {
  useEffect(() => {
    const cap = ref.current
    if (!playing || !cap || typeof cap.animate !== 'function' || reducedMotion()) return
    cap.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)', offset: 0.3 }, { transform: 'translateY(0)' }], {
      duration: 260,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    })
  }, [ref, playing])
}

/** When a pad gains a sound while the clip is on screen, the clip flies into the pad. */
function useSavedFlight(pads: Array<PadInfo | null>) {
  const before = useRef(pads)
  useLayoutEffect(() => {
    const previous = before.current
    before.current = pads
    if (previous === pads) return
    const slot = pads.findIndex((pad, index) => pad !== null && gainedSound([previous[index] ?? null], [pad]))
    const pad = pads[slot]
    const source = document.querySelector('.clip-wave-wrap')
    const face = document.querySelector(`[data-slot="${slot}"] .pad-face`)
    // Compact pads hide the face; the clip lands on the whole cap instead.
    const target = face && face.getBoundingClientRect().width > 0 ? face : document.querySelector(`[data-slot="${slot}"] .pad-cap`)
    if (!pad || !source || !target) return
    landHere(target, flyWaveform(pad.peaks, source.getBoundingClientRect(), target.getBoundingClientRect()))
  }, [pads])
}
