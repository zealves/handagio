// Lógica pura do shell da interface (sem React nem DOM): pesquisa, rotação de
// instrumentos, migração das preferências e fontes da composição de vídeo.
import { DEFAULT_CUSTOM_NOTES, LEGACY_CUSTOM_NOTES, normalizeCustomNotes } from '../../app/notes';
import { INSTRUMENTS, type InstrumentInfo } from '../../audio/instruments';
import { FAMILIES, type Family } from '../../audio/patches/types';
import { CHORD_MODES, type ChordMode } from '../../audio/theory';
import type { DrawerId } from '../../state/types';

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
  return FAMILIES.map((family) => ({
    family,
    items: list.filter((i) => i.family === family),
  })).filter((g) => g.items.length > 0);
}

/** Modo de tocar seguinte (chip da barra e tecla C): Nota → Tríade → Sétima → Quinta → Nota. */
export function nextChord(c: ChordMode): ChordMode {
  const k = CHORD_MODES.findIndex((m) => m.id === c);
  return CHORD_MODES[(k + 1) % CHORD_MODES.length].id;
}

export function nextInstrument(id: string, dir: 1 | -1, filter = 'Todos'): string {
  const list = filterByFamily(filter);
  if (!list.length) return id;
  const k = list.findIndex((i) => i.id === id);
  if (k < 0) return list[dir > 0 ? 0 : list.length - 1].id;
  return list[(k + dir + list.length) % list.length].id;
}

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

/**
 * Migração do `persist`: a v1 tinha `showVideo` e a v2 `stageBg` e `showWaves`. Desde a v3 o
 * palco mostra sempre só as mãos e as ondas estão sempre por baixo: as chaves antigas saem.
 * A v4 acrescenta os modos de notas (`tonicAt`, `noteMode`, `customNotes`) e a sensibilidade
 * dos polegares, com os valores por defeito quando faltam. A v6 desliga uma vez a altura da mão
 * (`heightPitch`), que passou a só escolher a nota e começa desligada; o arrastar (`glide`) fica.
 */
export function migratePrefs(old: unknown, version: number): Record<string, unknown> {
  const o: Record<string, unknown> = { ...((old as Record<string, unknown> | null) ?? {}) };
  if (version < 3) {
    delete o.showVideo;
    delete o.stageBg;
    delete o.showWaves;
  }
  if (version < 4) {
    if (o.tonicAt !== 'left-pinky') o.tonicAt = 'right-index';
    if (o.noteMode !== 'custom') o.noteMode = 'scale';
    o.customNotes = normalizeCustomNotes(o.customNotes);
    const ts = o.thumbSensitivity;
    o.thumbSensitivity =
      typeof ts === 'number' && Number.isFinite(ts) ? Math.min(1, Math.max(0, ts)) : 0.5;
  }
  if (version < 5) {
    // Notas personalizadas iguais ao antigo valor por defeito: nunca foram editadas.
    const c = o.customNotes;
    if (
      Array.isArray(c) &&
      c.length === LEGACY_CUSTOM_NOTES.length &&
      c.every((m, i) => m === LEGACY_CUSTOM_NOTES[i])
    )
      o.customNotes = [...DEFAULT_CUSTOM_NOTES];
    // Presets do utilizador anteriores à v4 não guardavam `tonicAt`: tinham a tónica no
    // indicador direito, que deixou de ser o defeito.
    const up = o.userPresets;
    if (up && typeof up === 'object' && !Array.isArray(up)) {
      o.userPresets = Object.fromEntries(
        Object.entries(up as Record<string, unknown>).map(([k, p]) => [
          k,
          p && typeof p === 'object' && !('tonicAt' in p) ? { ...p, tonicAt: 'right-index' } : p,
        ]),
      );
    }
  }
  if (version < 6) o.heightPitch = false;
  // v7: sem a lista de instrumentos recentes.
  if (version < 7) delete o.recentInstruments;
  return o;
}

/** O que entra no vídeo gravado: nunca a imagem da câmara, só as partículas e as mãos. */
export function compositeSources<C>(c: { particles: C | null; overlay: C | null }): {
  video: null;
  layers: (C | null)[];
} {
  return { video: null, layers: [c.particles, c.overlay] };
}
