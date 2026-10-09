import { THEME_PREFERENCES, applyTheme, type ThemePreference } from '../theme'
import type { PadInfo, Settings, SettingsPatch } from '../engine/types'
import { IconButton, KeyChip, Segmented, Slider, Toggle } from '../components/controls'
import { ExternalLinkIcon, TrashIcon } from '../components/icons'
import { RingMark } from '../components/RingMark'
import { useEngine } from '../state/EngineProvider'

const THEME_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const REPO_URL = 'https://github.com/ZHANGV25/ringpad'
const RETENTION_OPTIONS: ReadonlyArray<{ days: number; label: string }> = [
  { days: 1, label: '1 day' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'Forever' },
]

interface PadsTabProps {
  pads: Array<PadInfo | null>
}

export function PadsTab({ pads }: PadsTabProps) {
  const { api } = useEngine()
  return (
    <section className="group">
      <span className="hint">Drop an audio file on a pad in the main window, or save a clip to it.</span>
      <div>
        {pads.map((pad, slot) => (
          <div className={`pad-row ${pad ? '' : 'empty'}`} key={slot}>
            <div className="pad-row-top">
              <span className="slot-number">{slot + 1}</span>
              <span className="pad-name">{pad?.name ?? 'Empty'}</span>
              {pad ? <span className="muted small numeric">{pad.seconds.toFixed(1)} s</span> : null}
              {pad ? <KeyChip name={pad.hotkey} /> : null}
              {pad ? (
                <IconButton label={`Clear ${pad.name}`} onClick={() => void api.clearPad({ slot })}>
                  <TrashIcon />
                </IconButton>
              ) : null}
            </div>
            {pad ? (
              <div className="pad-row-bottom">
                <Slider label="Volume" value={pad.volume} min={0} max={1} step={0.01} percent onChange={(volume) => void api.setPadVolume({ slot, volume })} />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

interface GeneralTabProps {
  settings: Settings
}

export function GeneralTab({ settings }: GeneralTabProps) {
  const { api } = useEngine()
  const update = (patch: SettingsPatch) => void api.updateSettings({ patch })
  return (
    <>
      <section className="group">
        <span className="label">Theme</span>
        <Segmented
          label="Theme"
          options={THEME_PREFERENCES}
          value={settings.theme}
          labels={THEME_LABELS}
          onChange={(theme) => {
            applyTheme(theme)
            update({ theme })
          }}
        />
      </section>
      <section className="group">
        <span className="label">Startup</span>
        <Toggle checked={settings.startWithWindows} label="Start with Windows" onChange={(startWithWindows) => update({ startWithWindows })} />
        <Toggle
          checked={settings.startMinimized}
          label="Start in the tray"
          hint="Ringpad keeps listening with no window open."
          onChange={(startMinimized) => update({ startMinimized })}
        />
      </section>
      <section className="group">
        <span className="label">Clips</span>
        <label className="slider-row">
          <span>Keep clips for</span>
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

export function AboutTab() {
  const { api, state } = useEngine()
  return (
    <section className="group about-panel">
      <div className="about-head">
        <RingMark />
        <div>
          <h1>Ringpad</h1>
          <span className="muted small numeric">
            Version {state.version} · {state.backend} · MIT license
          </span>
        </div>
      </div>
      <div className="inline-control">
        <button type="button" className="button small" onClick={() => void api.openExternal({ url: REPO_URL })}>
          <ExternalLinkIcon /> Source on GitHub
        </button>
      </div>
      <p>
        <strong>Private by design.</strong> Ringpad only records audio your PC already plays, keeps clips on this PC,
        has no accounts and sends nothing anywhere.
      </p>
      <p>
        <strong>Use it kindly.</strong> Replaying people to mock or harass them breaks most games' rules. Clip what's
        funny or useful, not to target someone.
      </p>
    </section>
  )
}
