// Seletor de instrumentos preparado para muitos sons: chips de família, pesquisa (à vista com
// rato, atrás da lupa no toque) e uma grelha de cartões com um título por família.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { session } from '../../app/session';
import type { InstrumentInfo } from '../../audio/instruments';
import { FAMILIES } from '../../audio/patches/types';
import { useStore } from '../../state/store';
import { instrumentIcon } from '../icons/InstrumentIcons';
import p from '../panels/panels.module.css';
import { IconSearch } from '../icons/UiIcons';
import { filterByFamily, groupByFamily, searchInstruments } from './logic';
import { FINE_POINTER, useMedia } from './media';
import s from './InstrumentPicker.module.css';

const FILTERS = ['Todos', ...FAMILIES];

type SampleStatus = 'loading' | 'ready' | 'error' | undefined;

const LOAD_ERROR_DESC = 'Não foi possível carregar — toca para tentar de novo';

function Card({
  info,
  active,
  status,
  onPick,
  testId,
}: {
  info: InstrumentInfo;
  active: boolean;
  status: SampleStatus;
  onPick: (id: string) => void;
  testId: string;
}) {
  const loading = status === 'loading';
  const failed = status === 'error';
  const desc = failed ? LOAD_ERROR_DESC : info.desc;
  return (
    <button
      type="button"
      className={`${p.card} ${s.card}`}
      aria-pressed={active}
      aria-busy={loading || undefined}
      onClick={() => onPick(info.id)}
      title={`${info.name}${info.sampled ? ' (gravado)' : ''}: ${desc}`}
      data-row=""
      data-testid={testId}
    >
      <span className={s.iconWrap}>
        {instrumentIcon(info.id)}
        {loading && <span className={s.ring} aria-hidden />}
        {failed && <span className={s.errDot} aria-hidden />}
      </span>
      <span className={s.name}>{info.name}</span>
    </button>
  );
}

export function InstrumentPicker() {
  const instrument = useStore((st) => st.instrument);
  const filter = useStore((st) => st.familyFilter);
  const sampleStatus = useStore((st) => st.sampleStatus);
  const set = useStore((st) => st.set);
  const [q, setQ] = useState('');
  const fine = useMedia(FINE_POINTER);
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const showSearch = fine || searching || !!q;
  // No toque, a pesquisa fica atrás da lupa: o foco automático abriria o teclado virtual por cima
  // da folha. Ao abrir pela lupa, o foco vai para o campo.
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);

  const pick = (id: string) => {
    set({ instrument: id });
    // Ao clicar num instrumento cuja amostra falhou, tenta descarregá-la outra vez.
    if (sampleStatus[id] === 'error') session.loadSamples(id);
  };
  const found = searchInstruments(q, filterByFamily(filter));
  const groups = groupByFamily(found);

  // setas entre cartões (← → um a um, ↑ ↓ uma linha); ↓ no campo de pesquisa salta para o primeiro
  const onKey = (e: KeyboardEvent) => {
    const cols = list.current
      ? Math.max(
          1,
          getComputedStyle(list.current.querySelector(`.${p.cards}`) ?? list.current)
            .gridTemplateColumns.split(' ').length,
        )
      : 1;
    const d = { ArrowDown: cols, ArrowUp: -cols, ArrowRight: 1, ArrowLeft: -1 }[e.key] ?? 0;
    if (!d) return;
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target === input.current) return;
    const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-row]') ?? [])];
    if (!rows.length) return;
    e.preventDefault();
    const k = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (k < 0) rows[d > 0 ? 0 : rows.length - 1].focus();
    else if (k + d < 0) {
      if (showSearch) input.current?.focus();
    } else rows[Math.min(rows.length - 1, k + d)].focus();
  };

  return (
    <section className={s.picker} onKeyDown={onKey} aria-labelledby="inst-t" data-testid="instruments">
      <h3 className={p.label} id="inst-t">
        Instrumento
      </h3>
      <div className={s.top}>
        <div className={`${p.pillRow} ${s.filters}`} role="group" aria-label="Filtrar por família">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={p.pill}
              aria-pressed={filter === f}
              onClick={() => set({ familyFilter: f })}
              data-testid={`family-${f}`}
            >
              {f}
            </button>
          ))}
        </div>
        {!fine && (
          <button
            type="button"
            className={`${p.pill} ${s.lupa}`}
            aria-label="Procurar instrumento"
            aria-pressed={showSearch}
            onClick={() => {
              setSearching((x) => !x);
              setQ('');
            }}
            data-testid="instrument-search-toggle"
          >
            <IconSearch width={18} height={18} />
          </button>
        )}
      </div>
      {showSearch && (
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
      )}
      <div ref={list} className={s.list}>
        {groups.map((g) => (
          <section key={g.family} aria-label={g.family}>
            <h4 className={s.group}>
              {g.family} <span>{g.items.length}</span>
            </h4>
            <div className={p.cards}>
              {g.items.map((i) => (
                <Card
                  key={i.id}
                  info={i}
                  active={instrument === i.id}
                  status={sampleStatus[i.id]}
                  onPick={pick}
                  testId={`tile-${i.id}`}
                />
              ))}
            </div>
          </section>
        ))}
        {!groups.length && <p className={s.empty}>Nenhum instrumento encontrado.</p>}
      </div>
    </section>
  );
}
