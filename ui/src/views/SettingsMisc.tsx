import { THEME_PREFERENCES, applyTheme, type ThemePreference } from '../theme'
import type { Settings, SettingsPatch } from '../engine/types'
import { Segmented, Toggle } from '../components/controls'
import { ExternalLinkIcon } from '../components/icons'
import { Panda } from '../components/panda/Panda'
import { useEngine } from '../state/EngineProvider'
import { VbCableCredit } from './CableInstall'

const THEME_LABELS: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' }
const REPO_URL = 'https://github.com/ZHANGV25/ringpad'

interface AppTabProps {
  settings: Settings
}

/** How Ringpad looks and starts, and what it is. */
export function AppTab({ settings }: AppTabProps) {
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
      <About />
    </>
  )
}

function About() {
  const { api, state } = useEngine()
  return (
    <section className="group about-panel">
      <div className="about-head">
        <Panda mood="happy" size={58} label="Ringpad's panda" />
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
      <p>
        <strong>Virtual cable.</strong> Ringpad can install VB-CABLE for you. <VbCableCredit inText />
      </p>
    </section>
  )
}
