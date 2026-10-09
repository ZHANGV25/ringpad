import { useState } from 'react'
import { IconButton, Segmented } from '../components/controls'
import { BackIcon } from '../components/icons'
import { useEngine } from '../state/EngineProvider'
import { AudioTab } from './SettingsAudio'
import { HotkeysTab } from './SettingsHotkeys'
import { AboutTab, GeneralTab, PadsTab } from './SettingsMisc'
import { TalkTab } from './SettingsTalk'

type Tab = 'audio' | 'talk' | 'hotkeys' | 'pads' | 'general' | 'about'

interface Props {
  onBack: () => void
}

const TAB_LABELS: Record<Tab, string> = {
  audio: 'Audio',
  talk: 'Talk',
  hotkeys: 'Hotkeys',
  pads: 'Pads',
  general: 'General',
  about: 'About',
}
const TABS: readonly Tab[] = ['audio', 'talk', 'hotkeys', 'pads', 'general', 'about']

export function SettingsPage({ onBack }: Props) {
  const { state } = useEngine()
  const [tab, setTab] = useState<Tab>('audio')
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
        {tab === 'audio' ? <AudioTab settings={state.settings} /> : null}
        {tab === 'talk' ? <TalkTab settings={state.settings} talk={state.talk} /> : null}
        {tab === 'hotkeys' ? <HotkeysTab settings={state.settings} pads={state.pads} /> : null}
        {tab === 'pads' ? <PadsTab pads={state.pads} /> : null}
        {tab === 'general' ? <GeneralTab settings={state.settings} /> : null}
        {tab === 'about' ? <AboutTab /> : null}
      </div>
    </main>
  )
}
