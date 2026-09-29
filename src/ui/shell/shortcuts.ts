// Atalhos da interface: I esconder, E ecrã inteiro, , e . instrumento, Esc volta a mostrar.
// H e F já tocam notas; [ e ] precisam de AltGr no teclado português.
import { isTypingTarget } from '../../lib/keys';
import { getState } from '../../state/store';
import { toggleFullscreen } from './fullscreen';
import { nextInstrument } from './logic';

export function installShortcuts(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target as HTMLElement | null)) return;
    const st = getState();
    if (st.settingsOpen) return;
    const k = e.key.toLowerCase();
    if (k === 'i') st.set({ uiHidden: !st.uiHidden });
    else if (k === 'e') toggleFullscreen();
    else if (k === ',' || k === '.')
      st.set({ instrument: nextInstrument(st.instrument, k === '.' ? 1 : -1, st.familyFilter) });
    else if (k === 'escape' && st.uiHidden && !st.drawer) st.set({ uiHidden: false });
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', down);
  return () => window.removeEventListener('keydown', down);
}
