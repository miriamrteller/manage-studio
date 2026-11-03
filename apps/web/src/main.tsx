import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './fonts'
import './index.css'
import { initMonitoring } from './lib/monitoring'
import { enforceInactivityOnLoad } from './lib/inactivity/enforceOnLoad'

initMonitoring()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

// A browser reopened after a long break still holds a valid saved session. Sign it out BEFORE
// anything is drawn, so no signed-in page flashes up. Normally this returns at once.
enforceInactivityOnLoad()
  .catch((err) => console.warn('[inactivity] load check failed:', err instanceof Error ? err.message : err))
  .finally(() => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
