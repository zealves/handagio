import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import { App } from './app/App';
import { session } from './app/session';
import { audio } from './audio/engine';
import { live } from './state/live';
import { useStore } from './state/store';

// Ganchos de diagnóstico para testes e depuração (?debug no endereço).
if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __vsc: { session, audio, live, store: useStore } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
