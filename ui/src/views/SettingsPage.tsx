import { useState } from 'react'
import { IconButton, Segmented } from '../components/controls'
import { BackIcon } from '../components/icons'
import { useEngine } from '../state/EngineProvider'
import { ClipsTab } from './SettingsClips'
import { HotkeysTab } from './SettingsHotkeys'
import { MicTab } from './SettingsMic'
import { AppTab } from './SettingsMisc'

type Tab = 'mic' | 'clips' | 'keys' | 'app'

interface Props {
  onBack: () => void
}

/** Grouped by what you came to do: get heard, change what gets clipped, change keys, the rest. */
const TAB_LABELS: Record<Tab, string> = {
  mic: 'Mic',
  clips: 'Clips',
  keys: 'Keys',
  app: 'App',
}
const TABS: readonly Tab[] = ['mic', 'clips', 'keys', 'app']

export function SettingsPage({ onBack }: Props) {
  const { state } = useEngine()
  const [tab, setTab] = useState<Tab>('mic')
  if (!state.settings) {
    return null
  }
  return (
    <main className="settings-shell">
      <header className="settings-head">
        <IconButton label="Back" onClick={onBack}>
          <BackIcon />
        </IconButton>
        <span className="title">Settings</span>
        <span />
      </header>
      <Segmented label="Settings sections" options={TABS} value={tab} labels={TAB_LABELS} onChange={setTab} variant="tabs" />
      <div className="settings-body">
        {tab === 'mic' ? <MicTab settings={state.settings} talk={state.talk} /> : null}
        {tab === 'clips' ? <ClipsTab settings={state.settings} /> : null}
        {tab === 'keys' ? <HotkeysTab settings={state.settings} pads={state.pads} /> : null}
        {tab === 'app' ? <AppTab settings={state.settings} /> : null}
      </div>
    </main>
  )
}
