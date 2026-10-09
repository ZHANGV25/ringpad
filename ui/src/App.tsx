import { useCallback, useState } from 'react'
import { flushSync } from 'react-dom'
import type { EngineApi } from './engine/api'
import { reducedMotion } from './components/panda/motion'
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

type View = 'main' | 'settings'

type TransitionDocument = Document & { startViewTransition?: (update: () => void) => { finished: Promise<void> } }

/**
 * Moving between the main window and settings. The browser snapshots both pages and slides one
 * into the other on the compositor (app.css, view transitions): settings comes in from the right,
 * and Back returns the way it came.
 */
function useView(): [View, (next: View) => void] {
  const [view, setView] = useState<View>('main')
  const go = useCallback((next: View) => {
    const doc = document as TransitionDocument
    if (typeof doc.startViewTransition !== 'function' || reducedMotion()) {
      setView(next)
      return
    }
    const root = document.documentElement
    root.dataset.nav = next === 'settings' ? 'forward' : 'back'
    const transition = doc.startViewTransition(() => flushSync(() => setView(next)))
    void transition.finished.finally(() => delete root.dataset.nav)
  }, [])
  return [view, go]
}

function AppShell() {
  const { state } = useEngine()
  const [view, setView] = useView()
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
  view: View
  setView: (view: View) => void
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
