// Menu ⋯: todas as gavetas e esconder/mostrar a interface. No telemóvel é o
// menu principal. Vai para o <body> (portal): a barra tem backdrop-filter e transform, que
// prenderiam o position: fixed; assim o menu nunca sai do ecrã.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type Prefs, type Runtime } from '../../state/store';
import { IconMore } from '../icons/UiIcons';
import { CHORD_MODES } from '../../audio/theory';
import { ChordGlyph } from './ChordGlyph';
import { DRAWER_IDS, DRAWER_TITLES } from './logic';
import s from './ControlBar.module.css';

/** Posição do menu a partir do botão ⋯ (o CSS escolhe que variáveis usa em cada layout). */
function anchor(btn: HTMLElement): CSSProperties {
  const r = btn.getBoundingClientRect();
  const w = document.documentElement.clientWidth;
  const h = document.documentElement.clientHeight;
  return {
    ['--menu-right' as string]: `${w - r.right}px`,
    ['--menu-bottom' as string]: `${h - r.top + 10}px`,
    ['--menu-max' as string]: `${Math.max(r.top - 18, 120)}px`,
    ['--menu-left-of' as string]: `${w - r.left + 10}px`,
  };
}

export function MoreMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const uiHidden = useStore((st) => st.uiHidden);
  const chord = useStore((st) => st.chord);
  const set = useStore((st) => st.set);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = () => [
    ...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []),
  ];
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => btn.current && setPos(anchor(btn.current));
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !menu.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      // Esc fecha; Tab sai do menu: o foco volta ao ⋯ e o Tab segue a partir dele
      if (e.key === 'Escape' || e.key === 'Tab') {
        setOpen(false);
        btn.current?.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const all = items();
        if (!all.length) return;
        e.preventDefault();
        const i = all.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        all[(i + step + all.length) % all.length]!.focus();
      }
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  const pick = (p: Partial<Prefs & Runtime>) => {
    setOpen(false);
    // o item vai desaparecer: o foco passa para o ⋯, e a gaveta devolve-o aqui ao fechar
    btn.current?.focus();
    set(p);
  };
  return (
    <div ref={root}>
      <button
        ref={btn}
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
      {open &&
        createPortal(
          <div ref={menu} role="menu" className={s.menu} style={pos} aria-label="Mais opções">
            {DRAWER_IDS.map((d) => (
              <button
                key={d}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => pick({ drawer: d })}
                data-testid={`menu-${d}`}
              >
                {DRAWER_TITLES[d]}
              </button>
            ))}
            <div role="group" aria-label="Cada dedo toca" className={s.menuGroup}>
              <span aria-hidden>Cada dedo toca…</span>
              {CHORD_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={chord === m.id}
                  tabIndex={-1}
                  onClick={() => pick({ chord: m.id })}
                  data-testid={`menu-chord-${m.id}`}
                >
                  <span className={s.menuChord}>
                    <ChordGlyph mode={m.id} width={16} height={16} />
                    {m.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => pick({ uiHidden: !uiHidden })}
              data-testid="menu-hide"
            >
              {uiHidden ? 'Mostrar interface' : 'Esconder interface'} <kbd>I</kbd>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
