// Tira "Cada dedo toca…": as 7 formas de tocar num toque. No telemóvel abre pela pill do acorde e
// fecha ao escolher (a explicação aparece no aviso); nos ecrãs largos está sempre à vista e
// substitui a antiga coluna do palco. A explicação completa fica na tab Notas.
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { CHORD_MODES } from '../../audio/theory';
import { useStore } from '../../state/store';
import { ChordGlyph } from './ChordGlyph';
import { keyTarget } from './logic';
import { useMedia, WIDE } from './media';
import s from './ChordStrip.module.css';

/** Rótulos curtos para caberem 7 opções em 375 px. */
const SHORT: Record<string, string> = {
  off: 'Nota',
  octave: 'Oitava',
  power: 'Quinta',
  triad: 'Acorde',
  sus4: 'Sus',
  seventh: 'Sétima',
  ninth: 'Nona',
};

export function ChordStrip() {
  const chord = useStore((st) => st.chord);
  const open = useStore((st) => st.chordStrip);
  const set = useStore((st) => st.set);
  const docked = useMedia(WIDE);
  const root = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = docked || open;

  // aberta a pedido: o foco entra na opção escolhida; tocar fora ou Esc fecha
  useEffect(() => {
    if (docked || !open) return;
    refs.current[CHORD_MODES.findIndex((m) => m.id === chord)]?.focus({ preventScroll: true });
    const down = (e: PointerEvent) => {
      const t = e.target as Element;
      if (!root.current?.contains(t) && !t.closest?.('[data-chord-keep]'))
        set({ chordStrip: false });
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      set({ chordStrip: false });
      document.querySelector<HTMLElement>('[data-chord-keep]')?.focus();
    };
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
    // só ao abrir: escolher outra forma não volta a mexer no foco
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docked, open]);

  if (!shown) return null;

  const pick = (k: number, fromKey = false) => {
    const m = CHORD_MODES[k];
    set({ chord: m.id });
    if (docked) return;
    set({ notice: { text: `${m.label}: ${m.desc}` } });
    // com as setas fica aberta, para se poder continuar a escolher
    if (!fromKey) {
      set({ chordStrip: false });
      document.querySelector<HTMLElement>('[data-chord-keep]')?.focus();
    }
  };
  // radiogroup: setas e Home/End escolhem logo (o Espaço fica para a boca, decisão 14)
  const onKey = (e: KeyboardEvent) => {
    const k = CHORD_MODES.findIndex((m) => m.id === chord);
    const next = keyTarget(e.key, k, CHORD_MODES.length);
    if (next === null) return;
    e.preventDefault();
    pick(next, true);
    refs.current[next]?.focus();
  };

  return (
    <div
      ref={root}
      role="radiogroup"
      aria-label="Cada dedo toca"
      className={s.strip}
      data-docked={docked || undefined}
      onKeyDown={onKey}
      data-testid="chord-strip"
    >
      {docked && (
        <span className={s.title} aria-hidden>
          Cada dedo toca…
        </span>
      )}
      {CHORD_MODES.map((m, i) => (
        <button
          key={m.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={chord === m.id}
          aria-label={m.label}
          title={`${m.label}: ${m.desc}`}
          tabIndex={chord === m.id ? 0 : -1}
          className={s.opt}
          onClick={() => pick(i)}
          data-testid={`chord-${m.id}`}
        >
          <ChordGlyph mode={m.id} width={22} height={22} />
          <span className={s.label}>{docked ? m.label : SHORT[m.id]}</span>
        </button>
      ))}
    </div>
  );
}
