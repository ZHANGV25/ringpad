import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/tokens.css'
import './styles/app.css'
import './styles/main.css'
import './styles/pads.css'
import './styles/settings.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Missing #root element in index.html')
}

/** Development only: /?panda opens the panda lab. The production build drops it. */
const Lab = import.meta.env.DEV && new URLSearchParams(window.location.search).has('panda')
  ? lazy(() => import('./dev/PandaLab').then((module) => ({ default: module.PandaLab })))
  : null

createRoot(container).render(
  <StrictMode>
    {Lab ? (
      <Suspense fallback={null}>
        <Lab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
