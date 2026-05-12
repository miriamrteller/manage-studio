import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element not found')

// Initialize with defaults before React renders
// Layouts will override these once tenant data loads
document.documentElement.dir = 'rtl'
document.documentElement.lang = 'he'

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
