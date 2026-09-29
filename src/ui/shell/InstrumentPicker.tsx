// Seletor de instrumentos preparado para muitos sons: pesquisa, recentes, chips de família e
// filas compactas agrupadas por família.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { InstrumentInfo } from '../../audio/instruments';
import { FAMILIES } from '../../audio/patches/types';
import { useStore } from '../../state/store';
import { instrumentIcon } from '../icons/InstrumentIcons';
import p from '../panels/panels.module.css';
import { filterByFamily, groupByFamily, recentInfos, searchInstruments } from './logic';
import s from './InstrumentPicker.module.css';

const FILTERS = ['Todos', ...FAMILIES];

function Row({
  info,
  active,
  onPick,
  testId,
}: {
  info: InstrumentInfo;
  active: boolean;
  onPick: (id: string) => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      className={s.row}
      aria-pressed={active}
      onClick={() => onPick(info.id)}
      title={info.desc}
      data-row=""
      data-testid={testId}
    >
      <span className={s.icon}>{instrumentIcon(info.id)}</span>
      <span className={s.name}>{info.name}</span>
      <span className={s.desc}>{info.desc}</span>
    </button>
  );
}

export function InstrumentPicker() {
  const instrument = useStore((st) => st.instrument);
  const filter = useStore((st) => st.familyFilter);
  const recents = useStore((st) => st.recentInstruments);
  const set = useStore((st) => st.set);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // Só em dispositivos com apontador preciso: em ecrãs táteis o foco automático abriria o
  // teclado virtual por cima da folha inferior.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) input.current?.focus();
  }, []);

  const pick = (id: string) => set({ instrument: id });
  const found = searchInstruments(q, filterByFamily(filter));
  const groups = groupByFamily(found);
  const recent = !q.trim() && filter === 'Todos' ? recentInfos(recents) : [];

  // ↑/↓ entre filas; ↓ no campo de pesquisa salta para a primeira.
  const onKey = (e: KeyboardEvent) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-row]') ?? [])];
    if (!rows.length) return;
    e.preventDefault();
    const k = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (k < 0) rows[d > 0 ? 0 : rows.length - 1].focus();
    else if (k + d < 0) input.current?.focus();
    else rows[Math.min(rows.length - 1, k + d)].focus();
  };

  return (
    <div className={s.picker} onKeyDown={onKey} data-testid="instruments">
      <input
        ref={input}
        type="search"
        className={s.search}
        placeholder="Procurar instrumento…"
        aria-label="Procurar instrumento"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        data-testid="instrument-search"
      />
      <div className={p.filters} role="group" aria-label="Filtrar por família">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={p.chip}
            aria-pressed={filter === f}
            onClick={() => set({ familyFilter: f })}
          >
            {f}
          </button>
        ))}
      </div>
      <div ref={list} className={s.list}>
        {recent.length > 0 && (
          <section aria-label="Recentes">
            <h3 className={s.group}>Recentes</h3>
            {recent.map((i) => (
              <Row
                key={i.id}
                info={i}
                active={instrument === i.id}
                onPick={pick}
                testId={`recent-${i.id}`}
              />
            ))}
          </section>
        )}
        {groups.map((g) => (
          <section key={g.family} aria-label={g.family}>
            <h3 className={s.group}>
              {g.family} <span>{g.items.length}</span>
            </h3>
            {g.items.map((i) => (
              <Row
                key={i.id}
                info={i}
                active={instrument === i.id}
                onPick={pick}
                testId={`tile-${i.id}`}
              />
            ))}
          </section>
        ))}
        {!groups.length && <p className={s.empty}>Nenhum instrumento encontrado.</p>}
      </div>
    </div>
  );
}
