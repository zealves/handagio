import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_FINGERS,
  DIFFICULTIES,
  DIFFICULTY,
  hiddenHandIdx,
  idleHandSide,
  laneOf,
  normalizeGameFingers,
  POWER_REVERB_BOOST,
  powerReverb,
  roundLagMs,
} from './config';
import { mulberry32 } from './rng';
import type { AssignedHands, HandLandmarks } from '../vision/types';

// mãos de mentira: só a identidade importa para `hiddenHandIdx` (não o seu conteúdo)
const LEFT_HAND = [] as unknown as HandLandmarks;
const RIGHT_HAND = [] as unknown as HandLandmarks;

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

describe('hiddenHandIdx', () => {
  it('só dedos da esquerda, com a mão esquerda (a que joga) identificada: esconde a direita', () => {
    const assigned: AssignedHands = [LEFT_HAND, null];
    expect(hiddenHandIdx([4, 3, 2, 1], assigned)).toBe(1);
  });
  it('só dedos da direita, com a mão direita (a que joga) identificada: esconde a esquerda', () => {
    const assigned: AssignedHands = [null, RIGHT_HAND];
    expect(hiddenHandIdx([6, 7, 8, 9], assigned)).toBe(0);
  });
  it('dedos das duas mãos: ninguém fica de fora, sejam quais forem as mãos à vista', () => {
    const assigned: AssignedHands = [LEFT_HAND, RIGHT_HAND];
    expect(hiddenHandIdx(DEFAULT_GAME_FINGERS, assigned)).toBeNull();
  });
  it('a mão que joga não está identificada: não esconde nenhuma (pode estar do lado errado)', () => {
    // só dedos da esquerda jogam (a direita ficaria de fora), mas a esquerda não está identificada
    expect(hiddenHandIdx([4, 3, 2, 1], [null, RIGHT_HAND])).toBeNull();
    expect(hiddenHandIdx([4, 3, 2, 1], [null, null])).toBeNull();
  });
  it('só o lado que não joga está identificado: não esconde nenhuma', () => {
    // só dedos da esquerda jogam (a direita ficaria de fora); só a direita (que não joga) está
    // identificada — a esquerda (a que joga) continua por identificar
    expect(hiddenHandIdx([4, 3, 2, 1], [null, RIGHT_HAND])).toBeNull();
  });
  it('as duas mãos identificadas, com só um lado a jogar: esconde a que não joga', () => {
    const assigned: AssignedHands = [LEFT_HAND, RIGHT_HAND];
    expect(hiddenHandIdx([4, 3, 2, 1], assigned)).toBe(1); // joga a esquerda, esconde a direita
    expect(hiddenHandIdx([6, 7, 8, 9], assigned)).toBe(0); // joga a direita, esconde a esquerda
  });
});

describe('powerReverb', () => {
  it('sem a energia ativa, devolve o reverb do jogador sem alterar', () => {
    expect(powerReverb(0.3, false)).toBe(0.3);
    expect(powerReverb(0, false)).toBe(0);
  });
  it('com a energia ativa, soma POWER_REVERB_BOOST', () => {
    expect(powerReverb(0.3, true)).toBeCloseTo(0.3 + POWER_REVERB_BOOST);
    expect(powerReverb(0, true)).toBeCloseTo(POWER_REVERB_BOOST);
  });
  it('com a energia ativa, nunca passa de 1', () => {
    expect(powerReverb(0.9, true)).toBe(1);
    expect(powerReverb(1, true)).toBe(1);
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
