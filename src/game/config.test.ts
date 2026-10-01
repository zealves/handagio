import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY, laneOf } from './config';
import { mulberry32 } from './rng';

describe('faixas', () => {
  it('Fácil usa os médios e os indicadores, pela ordem do ecrã', () => {
    expect(DIFFICULTY.easy.fingers).toEqual([2, 1, 6, 7]);
    expect([2, 1, 6, 7].map((f) => laneOf(f, 'easy'))).toEqual([0, 1, 2, 3]);
  });
  it('dedos sem faixa e polegares dão -1', () => {
    expect(laneOf(3, 'easy')).toBe(-1);
    expect(laneOf(0, 'hard')).toBe(-1);
    expect(laneOf(5, 'hard')).toBe(-1);
  });
  it('4, 6 e 8 faixas', () => {
    expect(DIFFICULTIES.map((d) => DIFFICULTY[d].fingers.length)).toEqual([4, 6, 8]);
    expect(laneOf(9, 'hard')).toBe(7);
    expect(laneOf(4, 'hard')).toBe(0);
  });
});

describe('mulberry32', () => {
  it('a mesma semente dá a mesma sequência, em [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });
});
