import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './app/App';
import { session } from './app/session';
import { audio } from './audio/engine';
import { samples } from './audio/samples/loader';
import { DEBUG } from './lib/debug';
import { live } from './state/live';
import { useStore } from './state/store';
import { syntheticHand, type HandPose } from './vision/testHands';

// Ganchos de diagnóstico para testes e depuração (?debug no endereço). As mãos sintéticas saem
// normalizadas como as do MediaPipe para o vídeo atual (por defeito 640×360, 16:9).
if (DEBUG) {
  const hand = (closed: boolean[] | boolean, x?: number, y?: number, pose: HandPose = {}) =>
    syntheticHand(closed, x, y, { aspect: live.videoW / (live.videoH || 1) || 1, ...pose });
  Object.assign(window, {
    __vsc: { session, audio, samples, live, store: useStore, syntheticHand: hand },
  });
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
