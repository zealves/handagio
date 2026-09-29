// Mantém `recentInstruments` atualizado sempre que o instrumento muda (UI, preset ou atalho).
import { useStore } from '../../state/store';
import { pushRecent } from './logic';

export function installRecents(): () => void {
  const s = useStore.getState();
  if (s.recentInstruments[0] !== s.instrument)
    s.set({ recentInstruments: pushRecent(s.recentInstruments, s.instrument) });
  return useStore.subscribe((st, prev) => {
    if (st.instrument !== prev.instrument)
      st.set({ recentInstruments: pushRecent(st.recentInstruments, st.instrument) });
  });
}
