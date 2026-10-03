import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_FINGERS,
  DIFFICULTIES,
  DIFFICULTY,
  idleHandSide,
  laneOf,
  normalizeGameFingers,
  roundLagMs,
} from './config';
import { mulberry32 } from './rng';

describe('dedos do jogo', () => {
  it('por defeito: médios e indicadores, pela ordem do ecrã', () => {
    expect(DEFAULT_GAME_FINGERS).toEqual([2, 1, 6, 7]);
    expect([2, 1, 6, 7].map((f) => laneOf(f, DEFAULT_GAME_FINGERS))).toEqual([0, 1, 2, 3]);
    expect(laneOf(3, DEFAULT_GAME_FINGERS)).toBe(-1);
  });
  it('normaliza: ordem do ecrã, sem repetidos, sem polegares, pelo menos 2', () => {
    expect(normalizeGameFingers([9, 6, 7, 8])).toEqual([6, 7, 8, 9]);
    expect(normalizeGameFingers([1, 4, 1, 0, 5, 2])).toEqual([4, 2, 1]);
    expect(normalizeGameFingers([6])).toBeNull();
    expect(normalizeGameFingers([0, 5])).toBeNull();
    expect(normalizeGameFingers('x')).toBeNull();
    expect(normalizeGameFingers([6, 'a', 7])).toEqual([6, 7]);
  });
  it('a dificuldade só tem tempo, compassos e chegada', () => {
    expect(DIFFICULTIES.map((d) => DIFFICULTY[d].bpm)).toEqual([90, 110, 130]);
    expect(Object.keys(DIFFICULTY.easy).sort()).toEqual(['bars', 'bpm', 'lead']);
  });
  it('o atraso arredonda a 10 ms', () => {
    expect(roundLagMs(0.1234)).toBe(120);
    expect(roundLagMs(0.126)).toBe(130);
  });
});

describe('idleHandSide', () => {
  it('só com dedos de uma só mão diz o lado da outra (a que fica de fora)', () => {
    // dedos todos < 5 (esquerda): quem fica de fora é a direita
    expect(idleHandSide([4, 3, 2, 1])).toBe('right');
    // dedos todos ≥ 5 (direita): quem fica de fora é a esquerda
    expect(idleHandSide([6, 7, 8, 9])).toBe('left');
  });
  it('dedos das duas mãos, ou nenhum, não escondem nenhuma', () => {
    expect(idleHandSide(DEFAULT_GAME_FINGERS)).toBeNull();
    expect(idleHandSide([])).toBeNull();
    expect(idleHandSide(null)).toBeNull();
  });
});

describe('mulberry32', () => {
  it('a mesma semente dá a mesma sequência, em [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
