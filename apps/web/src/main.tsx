import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './fonts'
import './index.css'
import { initMonitoring } from './lib/monitoring'
import { enforceInactivityOnLoad } from './lib/inactivity/enforceOnLoad'
import { isDevPickerActive, readDevStudioChoice } from './lib/devStudioPicker'
import { DevSiteBar, DevStudioPickerPage } from './components/DevStudioPicker'

initMonitoring()

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

// A browser reopened after a long break still holds a valid saved session. Sign it out BEFORE
// anything is drawn, so no signed-in page flashes up. Normally this returns at once.
// The dev website (one address, studio picked from a list) shows the picker until a studio is
// chosen, then a thin bar above the app. Live builds never have the picker (devStudioPicker.ts).
const devPicker = isDevPickerActive()
const renderApp = () =>
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      {devPicker && !readDevStudioChoice() ? (
        <DevStudioPickerPage />
      ) : (
        <>
          {devPicker && <DevSiteBar />}
          <App />
        </>
      )}
    </React.StrictMode>,
  )

// Safety net: whatever the check does, the app is on screen within a few seconds.
let rendered = false
const renderOnce = () => {
  if (rendered) return
  rendered = true
  renderApp()
}
const safetyTimer = window.setTimeout(renderOnce, 8000)

enforceInactivityOnLoad()
  .then((signedOut) => {
    // After a sign-out the page is reloading onto the sign-in address; drawing now would flash the old page.
    if (signedOut) return
    window.clearTimeout(safetyTimer)
    renderOnce()
  })
  .catch((err) => {
    console.warn('[inactivity] load check failed:', err instanceof Error ? err.message : err)
    window.clearTimeout(safetyTimer)
    renderOnce()
  })
