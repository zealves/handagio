import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './app/App';
import { session } from './app/session';
import { audio } from './audio/engine';
import { samples } from './audio/samples/loader';
import { detectLang, installLangSync, setLang } from './i18n';
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

/** Língua guardada pelo utilizador (só se já a escolheu: o valor por defeito do store não conta). */
function savedLang(): unknown {
  try {
    return (
      JSON.parse(localStorage.getItem('handagio:prefs') ?? 'null') as { state?: { lang?: unknown } }
    )?.state?.lang;
  } catch {
    return undefined;
  }
}

// a app só monta depois de a língua chegar (um chunk pequeno; o pt é pré-carregado no index.html)
async function boot(): Promise<void> {
  await setLang(detectLang(savedLang(), navigator.languages ?? [navigator.language]));
  installLangSync();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void boot();
