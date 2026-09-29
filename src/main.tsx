import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './app/App';
import { session } from './app/session';
import { audio } from './audio/engine';
import { DEBUG } from './lib/debug';
import { live } from './state/live';
import { useStore } from './state/store';
import { syntheticHand } from './vision/testHands';

// Ganchos de diagnóstico para testes e depuração (?debug no endereço).
if (DEBUG) {
  Object.assign(window, { __vsc: { session, audio, live, store: useStore, syntheticHand } });
}

// Service worker (só em produção): cache da app e dos modelos para funcionar sem internet.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((e) => console.info('[pwa] sem service worker', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
