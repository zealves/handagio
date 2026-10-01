// Dicas do primeiro uso: vê o que já aconteceu (mãos, notas, boca) e marca as cumpridas nas
// preferências, para não voltarem. A escolha da dica está em `coachStep` (logic.ts).
import { useEffect, useRef, useState } from 'react';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import type { CoachId } from '../../state/types';
import { useFrame } from '../frame';
import { COACH_IDS, coachStep } from './logic';

/** Abertura da boca a partir da qual a dica da boca se dá por cumprida. */
const MOUTH_DONE = 0.35;

export function useCoach(): { id: CoachId | null; dismiss: () => void } {
  // enquanto a câmara arranca, nenhuma dica (a do teclado já não serve, a das mãos ainda não)
  const engine = useStore((st) => (st.cameraStarting ? 'none' : st.engine));
  const done = useStore((st) => st.coachDone);
  const faceOk = useStore((st) => st.faceState === 'ok');
  const set = useStore((st) => st.set);
  const [handsSeen, setHandsSeen] = useState(false);
  const [mouthSeen, setMouthSeen] = useState(false);
  // as notas contam por motor: as tocadas no teclado não cumprem "dobra um dedo"
  const [count, setCount] = useState({ engine, n: 0 });
  const notes = count.engine === engine ? count.n : 0;
  const seen = useRef({ hands: false, mouth: false });

  // cada nota nova conta (o nome repete-se, mas para "algumas notas" chega)
  useEffect(
    () =>
      useStore.subscribe((st, prev) => {
        if (st.lastNote === prev.lastNote || st.lastNote === '—') return;
        const e = st.cameraStarting ? 'none' : st.engine;
        setCount((c) => (c.engine === e ? { engine: e, n: c.n + 1 } : { engine: e, n: 1 }));
      }),
    [],
  );
  useFrame(() => {
    if (!seen.current.hands && live.hands.length) {
      seen.current.hands = true;
      setHandsSeen(true);
    }
    if (!seen.current.mouth && live.mouth > MOUTH_DONE) {
      seen.current.mouth = true;
      setMouthSeen(true);
    }
  });

  useEffect(() => {
    const add: CoachId[] = [];
    if (engine === 'hands' && handsSeen) add.push('hands');
    if (engine === 'hands' && notes > 0) add.push('bend');
    if (engine === 'keyboard' && notes > 0) add.push('touch');
    if (mouthSeen) add.push('mouth');
    const fresh = add.filter((id) => !done.includes(id));
    if (fresh.length) set({ coachDone: [...done, ...fresh] });
  }, [engine, handsSeen, notes, mouthSeen, done, set]);

  const id = coachStep({ engine, done, handsSeen, notes, faceOk });
  return { id, dismiss: () => set({ coachDone: [...COACH_IDS] }) };
}
