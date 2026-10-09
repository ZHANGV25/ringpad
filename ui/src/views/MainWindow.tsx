import { useEffect, useState } from 'react'
import type { EngineApi } from '../engine/api'
import { useEngine } from '../state/EngineProvider'
import type { EngineAction } from '../state/reducer'
import { ClipCard } from './main/ClipCard'
import { Footer } from './main/Footer'
import { PadGrid } from './main/PadGrid'
import { Tape } from './main/Tape'
import { TopBar } from './main/TopBar'

interface Props {
  onSettings: () => void
}

const AUDIO_FILE = /\.(wav|mp3|ogg|flac)$/i
const NOTICE_MS = 4000

export function MainWindow({ onSettings }: Props) {
  const { api, state, dispatch } = useEngine()
  const dragSlot = useFileDrop(api, dispatch)
  if (!state.settings) {
    return null
  }
  return (
    <main className="main-shell">
      <TopBar status={state.status} onSettings={onSettings} />
      <Tape settings={state.settings} />
      <ClipCard settings={state.settings} clip={state.clip} playback={state.playback} />
      <PadGrid pads={state.pads} clip={state.clip} playback={state.playback} dragSlot={dragSlot} />
      <Footer settings={state.settings} />
    </main>
  )
}

/** Tracks files dragged over the window and imports a dropped audio file into the pad under it. */
function useFileDrop(api: EngineApi, dispatch: (action: EngineAction) => void): number | null {
  const [dragSlot, setDragSlot] = useState<number | null>(null)
  useEffect(() => {
    return api.onFileDrop((event) => {
      if (event.type === 'leave') {
        setDragSlot(null)
        return
      }
      const slot = slotAt(event.position.x / window.devicePixelRatio, event.position.y / window.devicePixelRatio)
      if (event.type !== 'drop') {
        setDragSlot(slot)
        return
      }
      setDragSlot(null)
      const path = event.paths.find((item) => AUDIO_FILE.test(item))
      if (!path || slot === null) {
        const id = Date.now()
        dispatch({ type: 'error', id, message: 'Drop a WAV, MP3, OGG or FLAC file on a pad.' })
        window.setTimeout(() => dispatch({ type: 'clearError', id }), NOTICE_MS)
        return
      }
      void api.importPad({ slot, path })
    })
  }, [api, dispatch])
  return dragSlot
}

function slotAt(x: number, y: number): number | null {
  const element = document.elementFromPoint?.(x, y)?.closest('[data-slot]')
  const raw = element?.getAttribute('data-slot')
  return raw === undefined || raw === null ? null : Number(raw)
}
