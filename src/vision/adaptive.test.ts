import { describe, expect, it } from 'vitest';
import {
  AdaptiveRanges,
  LEARN_MIN_SAMPLES,
  LEARN_MIN_SPAN,
  LEARN_START_HI,
  LEARN_TAU_RISKY_S,
  LEARN_TAU_SAFE_S,
  LEARN_WINDOW,
  normalizeRanges,
  usableRange,
  validRange,
} from './adaptive';

/** Alimenta o dedo i com `n` amostras: `frac` delas em `hi`, o resto em `lo`. */
function feed(a: AdaptiveRanges, i: number, n: number, lo: number, hi: number, frac = 0.3) {
  for (let k = 0; k < n; k++) a.observe(i, (k % 10) / 10 < frac ? hi : lo, 1 / 30);
}

describe('adaptive', () => {
  it('percentis P10 e P90 da janela', () => {
    const a = new AdaptiveRanges();
    for (let k = 0; k <= 100; k++) a.observe(1, k / 100, 1 / 30);
    const w = a.windowRange(1);
    expect(w.lo).toBeCloseTo(0.1, 2);
    expect(w.hi).toBeCloseTo(0.9, 2);
  });

  it(`só aprende com pelo menos ${LEARN_MIN_SAMPLES} amostras`, () => {
    const a = new AdaptiveRanges();
    feed(a, 2, LEARN_MIN_SAMPLES - 1, 0.1, 0.8);
    expect(a.ranges[2]).toBeNull();
    feed(a, 2, 1, 0.1, 0.8);
    expect(a.ranges[2]).not.toBeNull();
    expect(a.ranges[2]!.lo).toBeCloseTo(0.1);
    // o primeiro intervalo não salta para a janela: `hi` começa em LEARN_START_HI e desce devagar
    expect(a.ranges[2]!.hi).toBeCloseTo(LEARN_START_HI);
    expect(usableRange(a.ranges[2])).toBe(true);
    feed(a, 2, 30, 0.1, 0.8);
    expect(a.ranges[2]!.hi).toBeLessThan(LEARN_START_HI);
    expect(a.ranges[2]!.hi).toBeGreaterThan(0.85);
  });

  it('janela sem movimento (mão parada) não aprende nem mexe no aprendido', () => {
    const a = new AdaptiveRanges();
    feed(a, 3, 300, 0.12, 0.2); // tremor pequeno: diferença abaixo de LEARN_MIN_SPAN
    expect(a.ranges[3]).toBeNull();
    a.load([null, null, null, { lo: 0.1, hi: 0.7 }]);
    const v = a.version;
    feed(a, 3, LEARN_WINDOW * 3, 0.1, 0.15);
    expect(a.ranges[3]).toEqual({ lo: 0.1, hi: 0.7 });
    expect(a.version).toBe(v);
  });

  it('EMA lenta: descer (mais sensível) demora, subir (menos sensível) é mais rápido', () => {
    expect(LEARN_TAU_RISKY_S).toBeGreaterThan(LEARN_TAU_SAFE_S * 3);
    const down = new AdaptiveRanges();
    down.load([null, { lo: 0.1, hi: 0.9 }]);
    feed(down, 1, 150, 0.1, 0.5); // 5 s a 30 fps
    const dropped = 0.9 - down.ranges[1]!.hi;
    expect(dropped).toBeGreaterThan(0);
    expect(dropped).toBeLessThan(0.4 * 0.25); // bem menos de um quarto do caminho
    const up = new AdaptiveRanges();
    up.load([null, { lo: 0.1, hi: 0.5 }]);
    feed(up, 1, 150, 0.1, 0.9);
    const rose = up.ranges[1]!.hi - 0.5;
    expect(rose).toBeGreaterThan(dropped * 3);
    expect(up.ranges[1]!.hi).toBeLessThanOrEqual(0.9);
  });

  it(`janela deslizante de ${LEARN_WINDOW} amostras`, () => {
    const a = new AdaptiveRanges();
    feed(a, 4, LEARN_WINDOW, 0.1, 0.8);
    expect(a.samples(4)).toBe(LEARN_WINDOW);
    // a janela esquece as amostras antigas
    feed(a, 4, LEARN_WINDOW, 0.3, 0.8);
    expect(a.windowRange(4).lo).toBeCloseTo(0.3);
  });

  it('snapshot arredondado, load valida e reset esquece', () => {
    const a = new AdaptiveRanges();
    expect(a.snapshot()).toBeNull();
    a.load([null, { lo: 0.1234, hi: 0.7891 }, { lo: 0.8, hi: 0.2 }, 'x' as never]);
    expect(a.snapshot()).toEqual([
      null,
      { lo: 0.12, hi: 0.79 },
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    a.reset();
    expect(a.snapshot()).toBeNull();
  });

  it('valida o que vem das preferências', () => {
    expect(validRange({ lo: 0.1, hi: 0.6 })).toEqual({ lo: 0.1, hi: 0.6 });
    expect(validRange({ lo: 0.6, hi: 0.1 })).toBeNull();
    expect(validRange({ lo: -1, hi: 0.5 })).toBeNull();
    expect(validRange({ lo: NaN, hi: 0.5 })).toBeNull();
    expect(validRange(null)).toBeNull();
    expect(normalizeRanges('x')).toBeNull();
    expect(normalizeRanges([null, null])).toBeNull();
    const n = normalizeRanges([null, { lo: 0.1, hi: 0.6 }]);
    expect(n).toHaveLength(10);
    expect(n![1]).toEqual({ lo: 0.1, hi: 0.6 });
    expect(usableRange({ lo: 0.1, hi: 0.1 + LEARN_MIN_SPAN })).toBe(false);
  });
});
