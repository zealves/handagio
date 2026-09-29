// Com a interface escondida, mexer o rato ou tocar mostra a barra durante `ms`.
import { useEffect, useState } from 'react';

export function useAutoHide(active: boolean, ms = 3000): boolean {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!active) return;
    let t = 0;
    const poke = () => {
      setPeek(true);
      clearTimeout(t);
      t = window.setTimeout(() => setPeek(false), ms);
    };
    window.addEventListener('pointermove', poke);
    window.addEventListener('pointerdown', poke);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', poke);
      window.removeEventListener('pointerdown', poke);
    };
  }, [active, ms]);
  return active && peek;
}
