/**
 * Entry point for the demo build (VITE_DEMO_MODE=true). Same app, with the
 * in-memory backend and the demo bar on top. See vite.config.ts.
 */
import './demoClient';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import { DemoBar } from './DemoBar';
import { DEMO_HOME } from './seed';
import '../fonts';
import '../index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

if (!window.location.hash) window.location.hash = DEMO_HOME.admin;

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <DemoBar />
    <App />
  </React.StrictMode>,
);
