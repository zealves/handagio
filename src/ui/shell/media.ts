// Media queries partilhadas pelo CSS e pelo JS (os .module.css repetem as mesmas condições).
import { useEffect, useState } from 'react';

/** A folha de configuração fica à direita (paisagem larga e desktop); senão, em baixo. */
export const SIDE_SHEET = '(orientation: landscape) and (min-width: 640px), (min-width: 1024px)';
/** Ecrã largo e alto: a tira "Cada dedo toca…" fica sempre à vista. */
export const WIDE = '(min-width: 1024px) and (min-height: 600px)';
/** Há rato (ou caneta): mostrar os atalhos e o campo de pesquisa. */
export const FINE_POINTER = '(pointer: fine)';

const match = (q: string) => typeof window !== 'undefined' && window.matchMedia(q).matches;

export function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => match(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const upd = () => setOn(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, [query]);
  return on;
}
