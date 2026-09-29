// Menu ⋯: todas as gavetas, o fundo do palco e esconder a interface. No telemóvel é o menu principal.
import { useEffect, useRef, useState } from 'react';
import { useStore, type Prefs, type Runtime } from '../../state/store';
import { IconMore } from '../icons/UiIcons';
import { DRAWER_IDS, DRAWER_TITLES, STAGE_BG_LABEL, STAGE_BGS } from './logic';
import s from './ControlBar.module.css';

export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const bg = useStore((st) => st.stageBg);
  const set = useStore((st) => st.set);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const pick = (p: Partial<Prefs & Runtime>) => {
    setOpen(false);
    set(p);
  };
  return (
    <div className={s.more} ref={root}>
      <button
        type="button"
        className={s.chip}
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="more"
      >
        <IconMore />
      </button>
      {open && (
        <div role="menu" className={s.menu} aria-label="Mais opções">
          {DRAWER_IDS.map((d) => (
            <button
              key={d}
              type="button"
              role="menuitem"
              onClick={() => pick({ drawer: d })}
              data-testid={`menu-${d}`}
            >
              {DRAWER_TITLES[d]}
            </button>
          ))}
          <div role="group" aria-label="Fundo do palco" className={s.menuGroup}>
            <span>Fundo do palco</span>
            {STAGE_BGS.map((b) => (
              <button
                key={b}
                type="button"
                role="menuitemradio"
                aria-checked={bg === b}
                onClick={() => pick({ stageBg: b })}
                data-testid={`menu-bg-${b}`}
              >
                {STAGE_BG_LABEL[b]}
              </button>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => pick({ uiHidden: true })}
            data-testid="menu-hide"
          >
            Esconder interface <kbd>I</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
