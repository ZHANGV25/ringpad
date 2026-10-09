import { useEffect, useState } from 'react'
import { THEME_PREFERENCES, applyTheme, type ThemePreference } from './theme'

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

export function App() {
  const [theme, setTheme] = useState<ThemePreference>('system')

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <main className="shell">
      <header className="topbar">
        <span className="title">Ringpad</span>
        <span className="muted">Engine not connected yet</span>
      </header>

      <section className="empty" aria-label="Pads">
        <p className="muted">Pads and the live buffer will show here.</p>
      </section>

      <footer className="topbar">
        <span className="muted">Theme</span>
        <div className="segmented" role="group" aria-label="Theme">
          {THEME_PREFERENCES.map((option) => (
            <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)}>
              {THEME_LABELS[option]}
            </button>
          ))}
        </div>
      </footer>
    </main>
  )
}
