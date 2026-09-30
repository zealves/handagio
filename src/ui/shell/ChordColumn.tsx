// Coluna "Cada dedo toca…" à esquerda do palco: as formas de tocar sempre à vista, com um
// desenho e um rótulo curto. A explicação fica numa dica (rato e teclado) ou num aviso breve
// depois de tocar no ecrã.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CHORD_MODES, type ChordMode } from '../../audio/theory';
import { useStore } from '../../state/store';
import { ChordGlyph } from './ChordGlyph';
import s from './ChordColumn.module.css';

const HOVER_DELAY = 300;
const TOAST_MS = 2000;

export function ChordColumn() {
  const chord = useStore((st) => st.chord);
  const set = useStore((st) => st.set);
  const started = useStore((st) => st.started);
  const [tip, setTip] = useState<ChordMode | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (m: ChordMode, delay = 0, hideAfter = 0) => {
    window.clearTimeout(timer.current);
    const open = () => {
      setTip(m);
      if (hideAfter) timer.current = window.setTimeout(() => setTip(null), hideAfter);
    };
    if (delay) timer.current = window.setTimeout(open, delay);
    else open();
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setTip(null);
  };

  // radiogroup: as setas mudam de opção e escolhem-na (o Espaço fica para a boca, decisão 14)
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const n = CHORD_MODES.length;
    const k = CHORD_MODES.findIndex((m) => m.id === chord);
    const next = (k + step + n) % n;
    set({ chord: CHORD_MODES[next].id });
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Cada dedo toca"
      className={s.col}
      onKeyDown={onKey}
      data-started={started}
      data-testid="chord-column"
    >
      <span className={s.title} aria-hidden>
        Cada dedo toca…
      </span>
      {CHORD_MODES.map((m, i) => {
        const tipId = `${uid}-${m.id}`;
        return (
          <div key={m.id} className={s.item}>
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={chord === m.id}
              aria-label={m.label}
              aria-describedby={tipId}
              tabIndex={chord === m.id ? 0 : -1}
              className={s.opt}
              onPointerEnter={(e) => e.pointerType === 'mouse' && show(m.id, HOVER_DELAY)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && hide()}
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(m.id)}
              onBlur={hide}
              onClick={(e) => {
                set({ chord: m.id });
                // no toque não há hover: a explicação aparece por um instante depois de escolher
                const touch =
                  (e.nativeEvent as PointerEvent).pointerType === 'touch' ||
                  window.matchMedia('(hover: none)').matches;
                if (touch) show(m.id, 0, TOAST_MS);
              }}
              data-testid={`chord-${m.id}`}
            >
              <ChordGlyph mode={m.id} className={s.glyph} />
              <span className={s.label}>{m.label}</span>
            </button>
            <span role="tooltip" id={tipId} className={s.tip} data-show={tip === m.id}>
              <b className={s.tipLabel}>{m.label}</b>
              {m.desc}
            </span>
          </div>
        );
      })}
    </div>
  );
}
