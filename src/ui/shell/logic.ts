// Lógica pura do shell da interface (sem React nem DOM): pesquisa, recentes, rotação de
// instrumentos e fundos, migração das preferências e fontes da composição de vídeo.
import { INSTRUMENT_BY_ID, INSTRUMENTS, type InstrumentInfo } from '../../audio/instruments';
import { FAMILIES, type Family } from '../../audio/patches/types';
import type { DrawerId, StageBg } from '../../state/types';

export function pushRecent(list: string[], id: string, max = 6): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

export const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const filterByFamily = (
  filter: string,
  list: InstrumentInfo[] = INSTRUMENTS,
): InstrumentInfo[] => (filter === 'Todos' ? list : list.filter((i) => i.family === filter));

export function searchInstruments(
  query: string,
  list: InstrumentInfo[] = INSTRUMENTS,
): InstrumentInfo[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list.filter((i) => {
    const hay = normalize(`${i.name} ${i.family} ${i.desc}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function groupByFamily(
  list: InstrumentInfo[],
): { family: Family; items: InstrumentInfo[] }[] {
  return FAMILIES.map((family) => ({ family, items: list.filter((i) => i.family === family) })).filter(
    (g) => g.items.length > 0,
  );
}

export const recentInfos = (ids: string[]): InstrumentInfo[] =>
  ids.map((id) => INSTRUMENT_BY_ID[id]).filter((i): i is InstrumentInfo => !!i);

export function nextInstrument(id: string, dir: 1 | -1, filter = 'Todos'): string {
  const list = filterByFamily(filter);
  if (!list.length) return id;
  const k = list.findIndex((i) => i.id === id);
  if (k < 0) return list[dir > 0 ? 0 : list.length - 1].id;
  return list[(k + dir + list.length) % list.length].id;
}

export const STAGE_BGS: StageBg[] = ['camara', 'maos', 'ondas'];
export const STAGE_BG_LABEL: Record<StageBg, string> = {
  camara: 'Câmara',
  maos: 'Só mãos',
  ondas: 'Ondas',
};
export const nextStageBg = (bg: StageBg): StageBg =>
  STAGE_BGS[(STAGE_BGS.indexOf(bg) + 1) % STAGE_BGS.length];

export const DRAWER_IDS: DrawerId[] = [
  'instrumentos',
  'escala',
  'efeitos',
  'tempo',
  'gravacoes',
  'rato',
];
export const DRAWER_TITLES: Record<DrawerId, string> = {
  instrumentos: 'Instrumentos',
  escala: 'Escala e acordes',
  efeitos: 'Efeitos',
  tempo: 'Tempo e looper',
  gravacoes: 'Gravações',
  rato: 'Tocar com o rato',
};

/** Migração do `persist`: v1 tinha `showVideo`; a v2 usa `stageBg`. */
export function migratePrefs(old: unknown, version: number): Record<string, unknown> {
  const o: Record<string, unknown> = { ...((old as Record<string, unknown> | null) ?? {}) };
  if (version < 2) {
    o.stageBg = o.showVideo === false ? 'maos' : 'camara';
    delete o.showVideo;
  }
  return o;
}

/** O que entra no vídeo gravado: segue o fundo do palco (a pessoa só aparece com `camara`). */
export function compositeSources<V, C>(
  bg: StageBg,
  video: V | null,
  c: { waves: C | null; particles: C | null; overlay: C | null },
): { video: V | null; layers: (C | null)[] } {
  return {
    video: bg === 'camara' ? video : null,
    layers: bg === 'ondas' ? [c.waves, c.particles, c.overlay] : [c.particles, c.overlay],
  };
}
