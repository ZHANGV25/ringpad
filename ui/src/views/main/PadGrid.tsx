import { useState } from 'react'
import { DEFAULT_PAD_HOTKEYS, type PadInfo } from '../../engine/types'
import { IconButton, KeyChip } from '../../components/controls'
import { MoreIcon } from '../../components/icons'
import { WaveformCanvas } from '../../components/WaveformCanvas'
import { useEngine } from '../../state/EngineProvider'
import { PadSheet } from './PadSheet'

interface PadGridProps {
  pads: Array<PadInfo | null>
  dragSlot: number | null
  sending: boolean
}

export function PadGrid({ pads, dragSlot, sending }: PadGridProps) {
  const [lastPlayed, setLastPlayed] = useState<number | null>(null)
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const menuPad = menuSlot === null ? null : pads[menuSlot] ?? null
  return (
    <section className="pads-grid" aria-label="Pads">
      {pads.map((pad, slot) => (
        <PadTile
          key={slot}
          pad={pad}
          slot={slot}
          dragging={dragSlot === slot}
          active={sending && lastPlayed === slot}
          onPlayed={() => setLastPlayed(slot)}
          onMenu={() => setMenuSlot(slot)}
        />
      ))}
      {menuSlot !== null && menuPad ? <PadSheet pad={menuPad} slot={menuSlot} close={() => setMenuSlot(null)} /> : null}
    </section>
  )
}

interface PadTileProps {
  pad: PadInfo | null
  slot: number
  dragging: boolean
  active: boolean
  onPlayed: () => void
  onMenu: () => void
}

function PadTile({ pad, slot, dragging, active, onPlayed, onMenu }: PadTileProps) {
  const { api } = useEngine()
  const hotkey = pad?.hotkey ?? DEFAULT_PAD_HOTKEYS[slot] ?? null
  const state = pad ? 'filled' : 'empty-pad'
  const play = () => {
    if (!pad) return
    onPlayed()
    void api.playPad({ slot })
  }
  return (
    <div
      className={`pad-tile ${state} ${dragging ? 'drop-target' : ''} ${active ? 'active' : ''}`}
      data-slot={slot}
      onContextMenu={(event) => {
        if (!pad) return
        event.preventDefault()
        onMenu()
      }}
    >
      <button
        type="button"
        className="pad-play"
        aria-label={pad ? `Play ${pad.name}` : `Pad ${slot + 1}, empty`}
        title={pad ? undefined : 'Drop an audio file here, or save a clip to this pad'}
        onClick={play}
      >
        <span className="pad-top">
          <span className="pad-name">{dragging ? 'Drop to import' : pad?.name ?? `Pad ${slot + 1}`}</span>
          {hotkey ? <KeyChip name={hotkey} faint={!pad} /> : null}
        </span>
        <span className="pad-bottom">
          {pad ? (
            <>
              <WaveformCanvas peaks={pad.peaks} className="pad-wave" label={`${pad.name} waveform`} />
              <span className="pad-length">{pad.seconds.toFixed(1)} s</span>
            </>
          ) : (
            <span className="pad-length muted">Empty</span>
          )}
        </span>
      </button>
      {pad ? (
        <IconButton label={`${pad.name} options`} className="pad-more" onClick={onMenu}>
          <MoreIcon />
        </IconButton>
      ) : null}
    </div>
  )
}
