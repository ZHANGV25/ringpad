import type { Settings } from '../../engine/types'
import { KeyChip } from '../../components/controls'
import { WaveformCanvas } from '../../components/WaveformCanvas'
import { useEngine } from '../../state/EngineProvider'

interface LiveStripProps {
  settings: Settings
  peaks: number[]
}

export function LiveStrip({ settings, peaks }: LiveStripProps) {
  const { api } = useEngine()
  return (
    <section className="card live-card" aria-label="Live audio">
      <WaveformCanvas
        peaks={peaks}
        className="live-canvas"
        markerSeconds={settings.grabSeconds}
        historySeconds={settings.historySeconds}
        label="Live audio history"
      />
      <div className="live-caption">
        <span className="muted numeric">
          Last {settings.historySeconds} s · a clip takes {settings.grabSeconds} s
        </span>
        <button type="button" className="button small" onClick={() => void api.grabClip()}>
          Clip <KeyChip name={settings.hotkeys.grab} />
        </button>
      </div>
    </section>
  )
}
