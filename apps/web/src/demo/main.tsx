/**
 * Entry point for the demo build (VITE_DEMO_MODE=true). Same app, with the
 * in-memory backend and the demo bar on top. See vite.config.ts.
 */
import './demoClient';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import { DemoBar } from './DemoBar';
import { DEMO_HOME, TENANT_ID } from './seed';
import '../fonts';
import '../index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

if (!window.location.hash) window.location.hash = DEMO_HOME.admin;

// The demo studio is already running: its "Finish setup" checklist starts with
// the logo step skipped (the demo has no logo), as if the owner pressed Skip.
// Same storage key and shape as features/setup-guide/hooks/useSetupGuide.ts.
try {
  const key = `setup-guide:${TENANT_ID}`;
  if (!window.localStorage.getItem(key)) {
    window.localStorage.setItem(key, JSON.stringify({ skipped: ['branding'], closed: false }));
  }
} catch {
  /* storage blocked: the checklist just shows the logo step */
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DemoBar />
    <App />
  </React.StrictMode>,
);
