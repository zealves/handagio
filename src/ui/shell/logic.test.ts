import { describe, expect, it } from 'vitest';
import { INSTRUMENTS } from '../../audio/instruments';
import {
  compositeSources,
  groupByFamily,
  migratePrefs,
  nextInstrument,
  nextStageBg,
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

describe('nextStageBg', () => {
  it('roda câmara → mãos → ondas → câmara', () => {
    expect(nextStageBg('camara')).toBe('maos');
    expect(nextStageBg('maos')).toBe('ondas');
    expect(nextStageBg('ondas')).toBe('camara');
  });
});

describe('migratePrefs', () => {
  it('v1 com showVideo false passa a só mãos', () => {
    const m = migratePrefs({ showVideo: false, bpm: 90 }, 1);
    expect(m).toEqual({ stageBg: 'maos', bpm: 90 });
  });
  it('v1 com showVideo true (ou ausente) passa a câmara', () => {
    expect(migratePrefs({ showVideo: true }, 1)).toEqual({ stageBg: 'camara' });
    expect(migratePrefs({}, 1)).toEqual({ stageBg: 'camara' });
  });
  it('estado nulo não rebenta', () => {
    expect(migratePrefs(null, 1)).toEqual({ stageBg: 'camara' });
  });
  it('v2 fica igual', () => {
    expect(migratePrefs({ stageBg: 'ondas' }, 2)).toEqual({ stageBg: 'ondas' });
  });
});

describe('compositeSources', () => {
  const c = { waves: 'W', particles: 'P', overlay: 'O' };
  it('câmara: vídeo e camadas sem ondas', () => {
    expect(compositeSources('camara', 'V', c)).toEqual({ video: 'V', layers: ['P', 'O'] });
  });
  it('só mãos: nunca passa o vídeo', () => {
    expect(compositeSources('maos', 'V', c)).toEqual({ video: null, layers: ['P', 'O'] });
  });
  it('ondas: sem vídeo, ondas por baixo', () => {
    expect(compositeSources('ondas', 'V', c)).toEqual({ video: null, layers: ['W', 'P', 'O'] });
  });
});
