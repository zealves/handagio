import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DRUMS, INSTRUMENTS } from '../audio/instruments';
import { FAMILIES } from '../audio/patches/types';
import { CHORD_MODES, SCALE_GROUPS, SCALE_NAMES } from '../audio/theory';
import { LEVELS } from '../game/levels';
import { FACTORY_PRESETS } from '../state/presets';
import { MOUTH_FX } from '../state/types';
import { searchInstruments } from '../ui/shell/logic';
import {
  cameraError,
  chordText,
  familyLabel,
  fingerName,
  instrumentText,
  mouthText,
  padLabels,
  presetLabel,
  scaleGroupLabel,
  scaleLabel,
} from './data';
import { loadLang, setLang } from './index';
import type { Messages } from './types';

/** Mesmas chaves nas duas línguas, todas as folhas preenchidas (texto não vazio ou função). */
function leaves(o: unknown, path = ''): string[] {
  if (typeof o === 'function') return [path];
  if (typeof o === 'string') {
    // o separador da nomenclatura pode ser vazio ("G7" em inglês)
    if (!o.trim() && path !== 'naming.sep') throw new Error(`vazio: ${path}`);
    return [path];
  }
  if (Array.isArray(o)) return o.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (o && typeof o === 'object')
    return Object.entries(o).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [path];
}

describe('línguas completas', () => {
  let pt: Messages;
  let en: Messages;
  beforeAll(async () => {
    pt = await loadLang('pt');
    en = await loadLang('en');
  });
  it('en tem exatamente as mesmas chaves que pt, todas preenchidas', () => {
    expect(leaves(en).sort()).toEqual(leaves(pt).sort());
  });
  it('todos os ids dos dados têm texto em en', () => {
    for (const i of INSTRUMENTS) expect(en.data.instruments[i.id]?.name, i.id).toBeTruthy();
    for (const f of FAMILIES) expect(en.data.families[f], f).toBeTruthy();
    for (const s of SCALE_NAMES) expect(en.data.scales[s], s).toBeTruthy();
    for (const g of SCALE_GROUPS) expect(en.data.scaleGroups[g.label], g.label).toBeTruthy();
    for (const c of CHORD_MODES) expect(en.data.chords[c.id]?.desc, c.id).toBeTruthy();
    for (const m of MOUTH_FX) expect(en.data.mouth[m.id]?.label, m.id).toBeTruthy();
    for (const k of Object.keys(DRUMS))
      expect(en.data.kits[k]?.length, k).toBe(DRUMS[k].labels.length);
    for (const p of Object.keys(FACTORY_PRESETS)) expect(en.data.presets[p], p).toBeTruthy();
  });
  it('todos os níveis do jogo têm nome em pt e em en', () => {
    for (const l of LEVELS) {
      expect((pt.game.levelNames as Record<string, string>)[l.id], l.id).toBeTruthy();
      expect((en.game.levelNames as Record<string, string>)[l.id], l.id).toBeTruthy();
    }
  });
});

/** Carateres não-emoji que o jogo usa como símbolos (estrelas e acidentes musicais). */
const EMOJI_ALLOW = new Set(['★', '☆', '♯', '♭']);
/** Pictogramas, bandeiras (indicadores regionais) e a marca das teclas (1️⃣ = 1 + U+FE0F + U+20E3). */
const EMOJI_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;

/** Conjuntos de argumentos de amostra para chamar um texto em função (`(n: number) => ...`,
 * etc.): cada função corre com cada valor em todos os argumentos e ainda com uma mistura, para
 * apanhar ramos diferentes (0, 1, plural, negativo, texto vazio, booleano). */
const SAMPLE_VALUES: unknown[] = [0, 1, 2, -5, '', 'x', true, false];
const SAMPLE_SETS: unknown[][] = [
  ...SAMPLE_VALUES.map((v) => Array<unknown>(6).fill(v)),
  [2, 'x', true, 'y', 3, false],
];

/** Todas as strings de um objeto de mensagens, incluindo o resultado de chamar cada função com
 * os argumentos de amostra (para apanhar emojis escondidos num texto gerado). Uma chamada que
 * lança com argumentos de um tipo que não espera ignora-se. */
function allTexts(o: unknown, path = ''): { path: string; text: string }[] {
  if (typeof o === 'function') {
    const fn = o as (...args: unknown[]) => unknown;
    const out: { path: string; text: string }[] = [];
    for (const args of SAMPLE_SETS) {
      try {
        const r = fn(...args.slice(0, fn.length));
        if (typeof r === 'string')
          out.push({
            path: `${path}(${args
              .slice(0, fn.length)
              .map((a) => JSON.stringify(a))
              .join(', ')})`,
            text: r,
          });
      } catch {
        // argumentos de um tipo que a mensagem não espera
      }
    }
    return out;
  }
  if (typeof o === 'string') return [{ path, text: o }];
  if (Array.isArray(o)) return o.flatMap((v, i) => allTexts(v, `${path}[${i}]`));
  if (o && typeof o === 'object')
    return Object.entries(o).flatMap(([k, v]) => allTexts(v, path ? `${path}.${k}` : k));
  return [];
}

describe('sem emojis', () => {
  let pt: Messages;
  let en: Messages;
  beforeAll(async () => {
    pt = await loadLang('pt');
    en = await loadLang('en');
  });
  it('nenhum texto da interface tem emojis (★ ☆ ♯ ♭ continuam)', () => {
    for (const [lang, msgs] of [
      ['pt', pt],
      ['en', en],
    ] as const) {
      for (const { path, text } of allTexts(msgs)) {
        const bad = [...text].filter((ch) => EMOJI_RE.test(ch) && !EMOJI_ALLOW.has(ch));
        expect(bad, `${lang}.${path}: ${JSON.stringify(text)}`).toEqual([]);
      }
    }
  });
});

describe('textos pelo id', () => {
  beforeAll(() => setLang('en'));
  afterAll(() => setLang('pt'));
  it('em inglês', () => {
    expect(instrumentText('violin').name).toBe('Violin');
    expect(familyLabel('Cordas')).toBe('Strings');
    expect(scaleLabel('Menor harmónica')).toBe('Harmonic minor');
    expect(scaleGroupLabel('Menores')).toBe('Minor');
    expect(chordText('seventh').label).toBe('Seventh');
    expect(mouthText('robot').label).toBe('Robot voice');
    expect(padLabels('drums')[1]).toBe('Snare');
    expect(presetLabel('Piano calmo')).toBe('Calm piano');
    // os sons do utilizador ficam com o nome que lhes deu
    expect(presetLabel('O meu')).toBe('O meu');
    expect(cameraError('NotFoundError')).toMatch(/camera/i);
    expect(cameraError('Weird')).toMatch(/Weird/);
    expect(fingerName(1)).toBe('L index');
  });
  it('a pesquisa encontra na língua atual e em português', () => {
    const textOf = (i: { id: string; family: string }) =>
      `${instrumentText(i.id).name} ${instrumentText(i.id).desc} ${familyLabel(i.family)}`;
    expect(searchInstruments('violin', undefined, textOf).map((i) => i.id)).toContain('violin');
    expect(searchInstruments('violino', undefined, textOf).map((i) => i.id)).toContain('violin');
    expect(searchInstruments('strings', undefined, textOf).map((i) => i.id)).toContain('cello');
  });
});
