import { describe, expect, it } from 'vitest';
import { Score } from './score';

describe('Score', () => {
  it('Perfeito 100, Bom 50, e o multiplicador sobe a cada 10 seguidos até ×4', () => {
    const s = new Score();
    expect(s.hit('perfect', 0)).toBe(100);
    expect(s.hit('good', 0)).toBe(50);
    for (let k = 0; k < 8; k++) s.hit('perfect', 0);
    expect(s.combo).toBe(10);
    expect(s.multiplier).toBe(2);
    expect(s.hit('perfect', 0)).toBe(200);
    for (let k = 0; k < 40; k++) s.hit('perfect', 0);
    expect(s.multiplier).toBe(4);
  });

  it('um falhado põe o combo a 0 e guarda o máximo', () => {
    const s = new Score();
    for (let k = 0; k < 12; k++) s.hit('perfect', 0);
    s.missed();
    expect(s.combo).toBe(0);
    expect(s.multiplier).toBe(1);
    expect(s.maxCombo).toBe(12);
    expect(s.miss).toBe(1);
  });

  it('resultado: precisão e atraso médio em ms', () => {
    const s = new Score();
    s.hit('perfect', 0.02);
    s.hit('good', 0.1);
    s.missed();
    s.missed();
    const r = s.result(4);
    expect(r.accuracy).toBeCloseTo((1 + 0.5) / 4);
    expect(r.meanOffsetMs).toBe(60);
    expect(r).toMatchObject({ perfect: 1, good: 1, miss: 2, total: 4, maxCombo: 2, points: 150 });
  });

  it('sem notas nem acertos', () => {
    const r = new Score().result(0);
    expect(r.accuracy).toBe(0);
    expect(r.meanOffsetMs).toBeNull();
  });

  it('conta as dobras vistas tarde', () => {
    const s = new Score();
    s.lateTap();
    s.lateTap();
    expect(s.result(0).lateTaps).toBe(2);
  });

  it('toques errados entram na precisão: 2 perfeitos, 2 notas e 2 errados dão 2/3', () => {
    const s = new Score();
    s.hit('perfect', 0);
    s.hit('perfect', 0);
    s.wrongTap();
    s.wrongTap();
    const r = s.result(2);
    expect(r.accuracy).toBeCloseTo(2 / 3);
    expect(r.wrongTaps).toBe(2);
  });

  it('wrongTap e nearTap põem o combo a 0', () => {
    const s = new Score();
    s.hit('perfect', 0);
    s.hit('perfect', 0);
    s.wrongTap();
    expect(s.combo).toBe(0);
    expect(s.wrongTaps).toBe(1);
    s.hit('perfect', 0);
    s.nearTap();
    expect(s.combo).toBe(0);
  });

  it('sem toques errados, a precisão não muda e wrongTaps fica a 0', () => {
    const s = new Score();
    s.hit('perfect', 0);
    expect(s.result(1).wrongTaps).toBe(0);
  });
});
