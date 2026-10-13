import type { Settings, SettingsPatch } from '../engine/types'
import { Slider } from '../components/controls'
import { useEngine } from '../state/EngineProvider'
import { SourcePicker } from './SettingsAudio'

const RETENTION_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'Forever' },
]

interface ClipsTabProps {
  settings: Settings
}

/** What Ringpad clips, how much, how loud, and how long clips are kept. */
export function ClipsTab({ settings }: ClipsTabProps) {
  const { api, state } = useEngine()
  const update = (patch: SettingsPatch) => void api.updateSettings({ patch })
  const outputs = state.devices.filter((device) => device.direction === 'output' && !device.virtualCable)
  return (
    <>
      <section className="group">
        <span className="label">Clip from</span>
        <SourcePicker settings={settings} />
      </section>
      <section className="group">
        <span className="label">Length</span>
        <Slider label="Each clip" value={settings.grabSeconds} min={1} max={30} step={1} suffix=" s" onChange={(grabSeconds) => update({ grabSeconds })} />
        <Slider label="Keep the last" value={settings.historySeconds} min={10} max={120} step={5} suffix=" s" onChange={(historySeconds) => update({ historySeconds })} />
      </section>
      <section className="group">
        <span className="label">Clip volume</span>
        <Slider label="Your team" value={settings.sendVolume} min={0} max={1} step={0.01} percent onChange={(sendVolume) => update({ sendVolume })} />
        <Slider label="You" value={settings.monitorVolume} min={0} max={1} step={0.01} percent onChange={(monitorVolume) => update({ monitorVolume })} />
        <label className="slider-row">
          <span>Plays in</span>
          <select aria-label="Headphones" value={settings.headphones ?? ''} onChange={(event) => update({ headphones: event.currentTarget.value || null })}>
            <option value="">Same as Windows</option>
            {outputs.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <span />
        </label>
      </section>
      <section className="group">
        <span className="label">Saved clips</span>
        <label className="slider-row">
          <span>Keep for</span>
          <select
            aria-label="Keep clips for"
            value={settings.clipRetentionDays}
            onChange={(event) => update({ clipRetentionDays: Number(event.currentTarget.value) })}
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
          <span />
        </label>
        <div className="inline-control">
          <button type="button" className="button small" onClick={() => void api.openClipsFolder()}>
            Open clips folder
          </button>
        </div>
      </section>
    </>
  )
}
