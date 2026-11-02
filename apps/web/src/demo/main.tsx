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

// Inside the artifact the demo runs in a sandboxed frame without "allow-modals":
// window.confirm() is ignored there and returns false, so every "Are you sure?"
// (delete a lead, cancel a shoot, activate a form…) would silently do nothing.
// When framed, the demo answers those questions "yes" itself. The data resets on
// refresh, so nothing real is at risk. Opened directly, the real dialog shows.
if (window.self !== window.top) {
  window.confirm = (message?: string) => {
    console.info('[demo] confirmed automatically:', message ?? '');
    return true;
  };
}

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
