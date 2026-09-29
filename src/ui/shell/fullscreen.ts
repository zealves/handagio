// Ecrã inteiro com a Fullscreen API; onde não existe (iPhone), esconde a interface.
import { useEffect, useState } from 'react';
import { getState } from '../../state/store';

export function toggleFullscreen(): void {
  const hide = () => getState().set({ uiHidden: !getState().uiHidden });
  if (!document.fullscreenEnabled) return hide();
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(hide);
}

export function useFullscreen(): { active: boolean; toggle: () => void } {
  const [active, setActive] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setActive(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  return { active, toggle: toggleFullscreen };
}
