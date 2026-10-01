// Lógica pura do shell da interface (sem React nem DOM): pesquisa, rotação de
// instrumentos, tabs da folha, dicas do primeiro uso, migração das preferências e fontes da
// composição de vídeo.
import { DEFAULT_CUSTOM_NOTES, LEGACY_CUSTOM_NOTES, normalizeCustomNotes } from '../../app/notes';
import { INSTRUMENTS, type InstrumentInfo } from '../../audio/instruments';
import { FAMILIES, type Family } from '../../audio/patches/types';
import {
  CHORD_MODES,
  SCALE_GROUPS,
  validChord,
  type ChordMode,
  type ScaleName,
} from '../../audio/theory';
import {
  DIFFICULTIES,
  GAME_INPUT_LAG_MS,
  LAG_MAX_MS,
  LAG_MIN_MS,
  LAG_STEP_MS,
} from '../../game/config';
import type { Difficulty } from '../../game/types';
import { DEFAULT_SOUND } from '../../state/store';
import { isLang } from '../../i18n/types';
import type { CoachId, Engine, SheetTab } from '../../state/types';
import { normalizeRanges } from '../../vision/adaptive';

export const normalize = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const filterByFamily = (
  filter: string,
  list: InstrumentInfo[] = INSTRUMENTS,
): InstrumentInfo[] => (filter === 'Todos' ? list : list.filter((i) => i.family === filter));

/**
 * Pesquisa sem acentos nem maiúsculas no nome, na família e na descrição em português e, com
 * `textOf`, também nos textos da língua atual (para "violin" e "violino" encontrarem o violino).
 */
export function searchInstruments(
  query: string,
  list: InstrumentInfo[] = INSTRUMENTS,
  textOf: (i: InstrumentInfo) => string = () => '',
): InstrumentInfo[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return list;
  return list.filter((i) => {
    const hay = normalize(`${i.name} ${i.family} ${i.desc} ${textOf(i)}`);
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

/** Forma de tocar seguinte (tecla C), da mais simples à mais rica, pela ordem de CHORD_MODES. */
export function nextChord(c: ChordMode): ChordMode {
  const k = CHORD_MODES.findIndex((m) => m.id === c);
  return CHORD_MODES[(k + 1) % CHORD_MODES.length].id;
}

/** Opção de destino de uma tecla num radiogroup (↓/→ seguinte, ↑/← anterior, Home, End) (ou `null` se a tecla não mexe na escolha). */
export function keyTarget(key: string, k: number, n: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  const step =
    key === 'ArrowDown' || key === 'ArrowRight'
      ? 1
      : key === 'ArrowUp' || key === 'ArrowLeft'
        ? -1
        : 0;
  return step ? (k + step + n) % n : null;
}

export function nextInstrument(id: string, dir: 1 | -1, filter = 'Todos'): string {
  const list = filterByFamily(filter);
  if (!list.length) return id;
  const k = list.findIndex((i) => i.id === id);
  if (k < 0) return list[dir > 0 ? 0 : list.length - 1].id;
  return list[(k + dir + list.length) % list.length].id;
}

export const SHEET_TABS: SheetTab[] = ['som', 'notas', 'efeitos', 'estudio'];
/** Tab que a tecla abre (1–4), ou `null`. */
export function tabForKey(key: string): SheetTab | null {
  const k = Number(key);
  return Number.isInteger(k) && k >= 1 && k <= SHEET_TABS.length ? SHEET_TABS[k - 1] : null;
}

/** Escalas à vista com a lista fechada: as mais usadas (a ativa junta-se se for outra). */
export const COMMON_SCALES: ScaleName[] = [
  'Maior',
  'Menor',
  'Pentatónica',
  'Blues',
  'Menor harmónica',
];

export function visibleScales(active: ScaleName, expanded: boolean): ScaleName[] {
  if (expanded) return SCALE_GROUPS.flatMap((g) => g.scales);
  return COMMON_SCALES.includes(active) ? COMMON_SCALES : [...COMMON_SCALES, active];
}

/** Notas tocadas antes de sugerir a boca. */
export const COACH_MOUTH_AFTER = 5;
export const COACH_IDS: CoachId[] = ['hands', 'bend', 'mouth', 'touch'];

/**
 * Dica do primeiro uso a mostrar agora (ou `null`): com as mãos, "mostra as mãos" até as ver,
 * "dobra um dedo" até à primeira nota e "abre a boca" depois de algumas notas (só com a deteção
 * da cara); sem câmara, "toca nas teclas" até à primeira nota. As cumpridas não voltam.
 */
export function coachStep(c: {
  engine: Engine;
  done: readonly CoachId[];
  handsSeen: boolean;
  notes: number;
  faceOk: boolean;
}): CoachId | null {
  const todo = (id: CoachId) => !c.done.includes(id);
  if (c.engine === 'keyboard') return todo('touch') && c.notes === 0 ? 'touch' : null;
  if (c.engine !== 'hands') return null;
  if (todo('hands') && !c.handsSeen) return 'hands';
  if (todo('bend') && c.notes === 0) return 'bend';
  if (todo('mouth') && c.faceOk && c.notes >= COACH_MOUTH_AFTER) return 'mouth';
  return null;
}

/**
 * Valores de fábrica do que "Repor efeitos" repõe (função: o store importa este módulo, por isso
 * os valores só se leem depois de ele carregar).
 */
export const effectDefaults = () => ({
  reverb: DEFAULT_SOUND.reverb,
  echo: DEFAULT_SOUND.echo,
  filter: DEFAULT_SOUND.filter,
  drive: DEFAULT_SOUND.drive,
  pitch: DEFAULT_SOUND.pitch,
  mouthFx: DEFAULT_SOUND.mouthFx,
});

/** Índices dos polegares (mão esquerda e direita). */
const THUMB_IDS = [0, 5] as const;

/**
 * Migração do `persist`: a v1 tinha `showVideo` e a v2 `stageBg` e `showWaves`. Desde a v3 o
 * palco mostra sempre só as mãos e as ondas estão sempre por baixo: as chaves antigas saem.
 * A v4 acrescenta os modos de notas (`tonicAt`, `noteMode`, `customNotes`) e a sensibilidade
 * dos polegares, com os valores por defeito quando faltam. A v6 desliga uma vez a altura da mão
 * (`heightPitch`), que passou a só escolher a nota e começa desligada; o arrastar (`glide`) fica.
 * A v8 liga a aprendizagem da mão (`learnHand`) sem nada aprendido (`learnedRanges`).
 * A v9 mede o polegar de outra forma (encostar ao lado do indicador): a calibração e o aprendido
 * dos polegares (índices 0 e 5) eram da medida antiga e voltam aos valores neutros.
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
  // v8: aprendizagem da mão, ligada por defeito, ainda sem nada aprendido.
  if (version < 8) {
    o.learnHand = true;
    o.learnedRanges = null;
  }
  if (version < 9) {
    const cal = o.calibration as { open?: unknown; closed?: unknown } | null | undefined;
    if (cal && Array.isArray(cal.open) && Array.isArray(cal.closed)) {
      const open = [...(cal.open as unknown[])];
      const closed = [...(cal.closed as unknown[])];
      // 0 e 0: os valores neutros do `CalibrationCollector` (o polegar volta à sensibilidade)
      for (const i of THUMB_IDS) {
        open[i] = 0;
        closed[i] = 0;
      }
      o.calibration = { ...cal, open, closed };
    }
    if (Array.isArray(o.learnedRanges)) {
      const r = [...(o.learnedRanges as unknown[])];
      for (const i of THUMB_IDS) if (i < r.length) r[i] = null;
      o.learnedRanges = r;
    }
  }
  return o;
}

/**
 * Validação das preferências guardadas a cada arranque (a migração só corre quando a versão
 * muda): uma forma de tocar desconhecida (de outra versão da app) passa a "Uma nota"; os
 * recordes, dificuldade e atraso do modo de jogo também são validados.
 */
export function sanitizePrefs<T extends Record<string, unknown>>(p: T): T {
  const out: Record<string, unknown> = { ...p };
  if ('chord' in p) out.chord = validChord(p.chord);
  // intervalos aprendidos estragados (ou de outra versão) são esquecidos
  if ('learnedRanges' in p) out.learnedRanges = normalizeRanges(p.learnedRanges);
  if ('learnHand' in p && typeof p.learnHand !== 'boolean') out.learnHand = true;
  if ('showFps' in p && typeof p.showFps !== 'boolean') out.showFps = false;
  if ('lang' in p && !isLang(p.lang)) out.lang = 'pt';
  if ('coachDone' in p)
    out.coachDone = Array.isArray(p.coachDone)
      ? p.coachDone.filter((c): c is CoachId => COACH_IDS.includes(c as CoachId))
      : [];
  if ('gameBest' in p) {
    const b = (p.gameBest && typeof p.gameBest === 'object' ? p.gameBest : {}) as Record<
      string,
      unknown
    >;
    out.gameBest = Object.fromEntries(
      DIFFICULTIES.map((d) => {
        const v = b[d];
        return [d, typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0];
      }),
    );
  }
  if ('gameDifficulty' in p && !DIFFICULTIES.includes(p.gameDifficulty as Difficulty))
    out.gameDifficulty = 'easy';
  if ('gameLagMs' in p) {
    const v = p.gameLagMs;
    out.gameLagMs =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.min(LAG_MAX_MS, Math.max(LAG_MIN_MS, Math.round(v / LAG_STEP_MS) * LAG_STEP_MS))
        : GAME_INPUT_LAG_MS;
  }
  return out as T;
}

/** O que entra no vídeo gravado: nunca a imagem da câmara, só as partículas e as mãos. */
export function compositeSources<C>(c: { particles: C | null; overlay: C | null }): {
  video: null;
  layers: (C | null)[];
} {
  return { video: null, layers: [c.particles, c.overlay] };
}
