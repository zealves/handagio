// Atalhos da interface: I esconder, E ecrã inteiro, , e . instrumento, C forma de tocar, 1–4 as
// tabs da folha (a mesma tecla fecha), Esc fecha a folha ou a tira, ou volta a mostrar a interface;
// no jogo, P alterna a pausa e Esc pausa. H e F já tocam notas; [ e ] precisam de AltGr no
// teclado português.
import { session } from '../../app/session';
import { isTypingTarget } from '../../lib/keys';
import { getState } from '../../state/store';
import { toggleFullscreen } from './fullscreen';
import { nextChord, nextInstrument, tabForKey } from './logic';
import { toggleSheet } from './sheetActions';

export function installShortcuts(): () => void {
  const down = (e: KeyboardEvent) => {
    // já tratado (por exemplo, o Esc que fechou a folha não volta a mostrar a interface)
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (isTypingTarget(e.target as HTMLElement | null)) return;
    const st = getState();
    if (st.settingsOpen) return;
    // no jogo os atalhos não mudam o som; P alterna a pausa e Esc pausa (na pausa, o Esc é
    // do cartão, que continua: tratá-lo aqui também voltava a pausar)
    if (st.game) {
      const k = e.key.toLowerCase();
      if (k === 'p' && (st.game.phase === 'playing' || st.game.phase === 'paused')) {
        if (st.game.phase === 'paused') session.resumeGame();
        else session.pauseGame();
        e.preventDefault();
      } else if (e.key === 'Escape' && st.game.phase === 'playing') {
        session.pauseGame();
        e.preventDefault();
      }
      return;
    }
    const k = e.key.toLowerCase();
    const tab = tabForKey(k);
    // com a folha aberta, I e E não mexem na interface por trás dela
    if ((k === 'i' || k === 'e') && st.sheet) return;
    if (k === 'i') st.set({ uiHidden: !st.uiHidden });
    else if (k === 'e') toggleFullscreen();
    else if (k === ',' || k === '.')
      st.set({ instrument: nextInstrument(st.instrument, k === '.' ? 1 : -1, st.familyFilter) });
    else if (k === 'c') st.set({ chord: nextChord(st.chord) });
    else if (tab && st.started) toggleSheet(tab);
    else if (k === 'escape' && st.sheet) st.set({ sheet: null });
    else if (k === 'escape' && st.uiHidden) st.set({ uiHidden: false });
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', down);
  return () => window.removeEventListener('keydown', down);
}
