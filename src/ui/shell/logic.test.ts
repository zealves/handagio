import { describe, expect, it } from 'vitest';
import { DEFAULT_CUSTOM_NOTES } from '../../app/notes';
import { INSTRUMENTS } from '../../audio/instruments';
import {
  compositeSources,
  groupByFamily,
  migratePrefs,
  nextInstrument,
  normalize,
  pushRecent,
  recentInfos,
  searchInstruments,
} from './logic';

describe('pushRecent', () => {
  it('põe no início, sem duplicados, até ao máximo', () => {
    expect(pushRecent([], 'piano')).toEqual(['piano']);
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
  it('não altera a lista original', () => {
    const l = ['a'];
    pushRecent(l, 'b');
    expect(l).toEqual(['a']);
  });
});

describe('pesquisa', () => {
  it('normaliza acentos e maiúsculas', () => {
    expect(normalize('  Órgão ')).toBe('orgao');
  });
  it('encontra pelo nome sem acentos', () => {
    const r = searchInstruments('orgao');
    expect(r.map((i) => i.id)).toContain('organ');
  });
  it('encontra pela família', () => {
    const r = searchInstruments('percussao');
    expect(r.length).toBeGreaterThanOrEqual(3);
    expect(r.every((i) => i.family === 'Percussão')).toBe(true);
  });
  it('todas as palavras têm de aparecer', () => {
    expect(searchInstruments('piano zzzz')).toEqual([]);
  });
  it('pesquisa vazia devolve a lista', () => {
    expect(searchInstruments('   ')).toHaveLength(INSTRUMENTS.length);
  });
});

describe('groupByFamily', () => {
  it('agrupa pela ordem de FAMILIES e omite grupos vazios', () => {
    const g = groupByFamily(INSTRUMENTS);
    expect(g[0].family).toBe('Teclas');
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(INSTRUMENTS.length);
    expect(groupByFamily(searchInstruments('marimba')).map((x) => x.family)).toEqual(['Lâminas']);
  });
});

describe('recentInfos', () => {
  it('ignora ids desconhecidos', () => {
    expect(recentInfos(['piano', 'nao-existe', 'marimba']).map((i) => i.id)).toEqual([
      'piano',
      'marimba',
    ]);
  });
});

describe('nextInstrument', () => {
  const first = INSTRUMENTS[0].id;
  const last = INSTRUMENTS[INSTRUMENTS.length - 1].id;
  it('avança e dá a volta', () => {
    expect(nextInstrument(INSTRUMENTS[0].id, 1)).toBe(INSTRUMENTS[1].id);
    expect(nextInstrument(last, 1)).toBe(first);
    expect(nextInstrument(first, -1)).toBe(last);
  });
  it('respeita o filtro de família', () => {
    const drums = INSTRUMENTS.filter((i) => i.family === 'Percussão');
    expect(nextInstrument(drums[drums.length - 1].id, 1, 'Percussão')).toBe(drums[0].id);
    // instrumento atual fora do filtro: vai para o primeiro do filtro
    expect(nextInstrument('piano', 1, 'Percussão')).toBe(drums[0].id);
  });
});

describe('migratePrefs', () => {
  // campos que a v4 acrescenta quando faltam
  const V4 = {
    tonicAt: 'right-index',
    noteMode: 'scale',
    customNotes: [...DEFAULT_CUSTOM_NOTES],
    thumbSensitivity: 0.5,
  };
  it('v1 perde showVideo e mantém o resto', () => {
    expect(migratePrefs({ showVideo: false, bpm: 90 }, 1)).toEqual({ ...V4, bpm: 90 });
  });
  it('v2 perde stageBg e showWaves e mantém o resto', () => {
    expect(migratePrefs({ stageBg: 'camara', showWaves: false, bpm: 90 }, 2)).toEqual({
      ...V4,
      bpm: 90,
    });
  });
  it('estado nulo não rebenta', () => {
    expect(migratePrefs(null, 1)).toEqual(V4);
  });
  it('v3 ganha os modos de notas e a sensibilidade dos polegares', () => {
    expect(migratePrefs({ bpm: 90 }, 3)).toEqual({ ...V4, bpm: 90 });
  });
  it('v3 mantém valores válidos e corrige os inválidos', () => {
    const notes = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];
    expect(
      migratePrefs({ tonicAt: 'left-pinky', noteMode: 'custom', customNotes: notes }, 3),
    ).toMatchObject({ tonicAt: 'left-pinky', noteMode: 'custom', customNotes: notes });
    const bad = migratePrefs({ tonicAt: 'x', noteMode: 2, customNotes: [60, 'a', 500] }, 3);
    expect(bad.tonicAt).toBe('right-index');
    expect(bad.noteMode).toBe('scale');
    expect(bad.customNotes).toEqual([
      60,
      DEFAULT_CUSTOM_NOTES[1],
      107,
      ...DEFAULT_CUSTOM_NOTES.slice(3),
    ]);
  });
  it('v3: sensibilidade dos polegares limitada a 0..1', () => {
    expect(migratePrefs({ thumbSensitivity: 3 }, 3).thumbSensitivity).toBe(1);
    expect(migratePrefs({ thumbSensitivity: -0.4 }, 3).thumbSensitivity).toBe(0);
    expect(migratePrefs({ thumbSensitivity: 0.7 }, 3).thumbSensitivity).toBe(0.7);
    expect(migratePrefs({ thumbSensitivity: NaN }, 3).thumbSensitivity).toBe(0.5);
    expect(migratePrefs({ thumbSensitivity: '0.9' }, 3).thumbSensitivity).toBe(0.5);
  });
  it('v4 fica igual', () => {
    expect(migratePrefs({ bpm: 90 }, 4)).toEqual({ bpm: 90 });
  });
});

describe('compositeSources', () => {
  it('nunca inclui o vídeo da câmara; camadas são partículas e mãos', () => {
    expect(compositeSources({ particles: 'P', overlay: 'O' })).toEqual({
      video: null,
      layers: ['P', 'O'],
    });
  });
});
