import { useEffect, useRef, type KeyboardEvent } from 'react';
import { INSTRUMENTS, instrumentInfo } from '../../audio/instruments';
import { FAMILIES } from '../../audio/patches/types';
import { useStore } from '../../state/store';
import { INSTRUMENT_ICONS } from '../icons/InstrumentIcons';
import { prefersReducedMotion } from '../theme';
import { Panel } from './Panel';
import s from './panels.module.css';

const FILTERS = ['Todos', ...FAMILIES];

export function InstrumentSelect() {
  const instrument = useStore((st) => st.instrument);
  const filter = useStore((st) => st.familyFilter);
  const set = useStore((st) => st.set);
  const grid = useRef<HTMLDivElement>(null);
  // Traz a tile ativa à vista quando o instrumento muda (por exemplo, ao carregar um preset).
  useEffect(() => {
    grid.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [instrument, filter]);
  const list = filter === 'Todos' ? INSTRUMENTS : INSTRUMENTS.filter((i) => i.family === filter);

  // Setas movem o foco entre tiles (3 colunas).
  const onKey = (e: KeyboardEvent) => {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[e.key];
    if (!d) return;
    const tiles = [...(grid.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const k = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (k < 0) return;
    e.preventDefault();
    tiles[Math.max(0, Math.min(tiles.length - 1, k + d))]?.focus();
  };

  return (
    <Panel title="Seleção de instrumento" testId="instruments">
      <div className={s.filters} role="group" aria-label="Filtrar por família">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={s.chip}
            aria-pressed={filter === f}
            onClick={() => set({ familyFilter: f })}
          >
            {f}
          </button>
        ))}
      </div>
      <div className={s.grid} ref={grid} onKeyDown={onKey} role="group" aria-label="Instrumentos">
        {list.map((i) => (
          <button
            key={i.id}
            type="button"
            className={s.tile}
            aria-pressed={instrument === i.id}
            onClick={() => set({ instrument: i.id })}
            title={i.desc}
            data-testid={`tile-${i.id}`}
          >
            {INSTRUMENT_ICONS[i.id]}
            <span>{i.name}</span>
          </button>
        ))}
      </div>
      <p className={s.desc} aria-live="polite">
        <strong>{instrumentInfo(instrument).name}.</strong> {instrumentInfo(instrument).desc}
      </p>
    </Panel>
  );
}
