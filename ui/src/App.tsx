import { useState } from 'react'
import type { EngineApi } from './engine/api'
import { EngineProvider, useEngine } from './state/EngineProvider'
import { FirstRun } from './views/FirstRun'
import { MainWindow } from './views/MainWindow'
import { SettingsPage } from './views/SettingsPage'

interface Props {
  api?: EngineApi
}

export function App({ api }: Props) {
  return (
    <EngineProvider api={api}>
      <AppShell />
    </EngineProvider>
  )
}

function AppShell() {
  const { state } = useEngine()
  const [view, setView] = useState<'main' | 'settings'>('main')
  return (
    <>
      <AppView view={view} setView={setView} />
      {state.notice ? (
        <div className="notice" role="alert">
          {state.notice.message}
        </div>
      ) : null}
    </>
  )
}

interface AppViewProps {
  view: 'main' | 'settings'
  setView: (view: 'main' | 'settings') => void
}

function AppView({ view, setView }: AppViewProps) {
  const { state } = useEngine()
  if (!state.loaded || !state.settings) {
    return (
      <main className="shell">
        <p className="muted">Starting</p>
      </main>
    )
  }
  if (!state.settings.firstRunDone) {
    return <FirstRun onFinish={() => setView('main')} />
  }
  if (view === 'settings') {
    return <SettingsPage onBack={() => setView('main')} />
  }
  return <MainWindow onSettings={() => setView('settings')} />
}
