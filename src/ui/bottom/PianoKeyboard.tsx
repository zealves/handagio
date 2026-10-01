// Teclado de piano (2 ou 3 oitavas, conforme a largura, a partir de uma oitava abaixo da base). Ilumina as notas que estão a soar
// e toca com rato, toque ou teclado (setas + Enter). As luzes são atualizadas no ticker,
// diretamente no DOM, sem re-render.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { session } from '../../app/session';
import { SAMPLED_BY_ID } from '../../audio/instruments';
import { noteName, pitchClassName } from '../../audio/theory';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { useT } from '../../i18n';
import { useFrame } from '../frame';
import s from './bottom.module.css';

const BLACK = new Set([1, 3, 6, 8, 10]);
/** Largura mínima (px) para mostrar 3 oitavas em vez de 2. */
const WIDE = 470;

export function PianoKeyboard() {
  const octave = useStore((st) => st.octave);
  const instrument = useStore((st) => st.instrument);
  const register = SAMPLED_BY_ID[instrument]?.register ?? 0;
  const tr = useT().keyboard;
  const wrap = useRef<HTMLDivElement>(null);
  const [octaves, setOctaves] = useState(3);
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setOctaves(el.clientWidth >= WIDE ? 3 : 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const first = 12 * (octave + register); // Dó uma oitava abaixo da oitava base, ajustado ao registo
  const keys = Array.from({ length: octaves * 12 + 1 }, (_, k) => first + k);
  const whites = keys.filter((m) => !BLACK.has(m % 12));
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const down = useRef(new Set<number>());
  const pressing = useRef(false);
  const [focus, setFocus] = useState(first + 12);

  useFrame(() => {
    refs.current.forEach((el, m) => {
      const n = live.notes.get(m);
      const on = !!n && n.level > 0.05;
      if (on) {
        if (!el.dataset.on) el.dataset.on = '1';
        el.style.setProperty('--c', n!.color);
        el.style.opacity = String(0.55 + 0.45 * Math.min(1, n!.level));
      } else if (el.dataset.on) {
        delete el.dataset.on;
        el.style.opacity = '';
      }
    });
  });

  const press = (m: number) => {
    if (down.current.has(m)) return;
    down.current.add(m);
    session.pianoDown(m);
  };
  const lift = (m: number) => {
    if (!down.current.delete(m)) return;
    session.pianoUp(m);
  };
  const pd = (m: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    pressing.current = true;
    press(m);
  };
  const pe = (m: number) => (e: PointerEvent) => {
    if (pressing.current && e.buttons) press(m);
  };
  const pl = (m: number) => () => lift(m);
  const pu = (m: number) => () => {
    pressing.current = false;
    lift(m);
  };
  const onKey = (e: KeyboardEvent, m: number) => {
    if (e.key === 'Enter' && !e.repeat) {
      e.preventDefault();
      press(m);
    }
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (d) {
      e.preventDefault();
      const n = Math.max(keys[0], Math.min(keys[keys.length - 1], m + d));
      setFocus(n);
      refs.current.get(n)?.focus();
    }
  };
  const onKeyUp = (e: KeyboardEvent, m: number) => {
    if (e.key === 'Enter') lift(m);
  };

  const wPct = 100 / whites.length;
  const btn = (m: number) => ({
    ref: (el: HTMLButtonElement | null) => {
      if (el) refs.current.set(m, el);
      else refs.current.delete(m);
    },
    type: 'button' as const,
    tabIndex: m === focus ? 0 : -1,
    'aria-label': noteName(m),
    onPointerDown: pd(m),
    onPointerEnter: pe(m),
    onPointerLeave: pl(m),
    onPointerUp: pu(m),
    onPointerCancel: pu(m),
    onKeyDown: (e: KeyboardEvent) => onKey(e, m),
    onKeyUp: (e: KeyboardEvent) => onKeyUp(e, m),
    onBlur: () => lift(m),
    'data-testid': `key-${m}`,
  });

  return (
    <div className={s.scroll} ref={wrap}>
      <div className={s.piano} role="group" aria-label={tr.piano}>
        {whites.map((m) => (
          <button key={m} className={s.white} {...btn(m)}>
            <span className={s.keyName}>{m % 12 === 0 ? noteName(m) : pitchClassName(m)}</span>
          </button>
        ))}
        {keys
          .filter((m) => BLACK.has(m % 12))
          .map((m) => {
            const wi = whites.filter((w) => w < m).length;
            return (
              <button
                key={m}
                className={s.black}
                style={{ left: `calc(${wi * wPct}% - ${wPct * 0.32}%)`, width: `${wPct * 0.64}%` }}
                {...btn(m)}
              >
                <span className={s.keyName}>{pitchClassName(m)}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
