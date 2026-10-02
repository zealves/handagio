import { describe, expect, it } from 'vitest';
import { isUnlocked, LEVELS, levelIndex, starsFor } from './levels';

describe('starsFor', () => {
  it('segue os limiares de precisão', () => {
    expect(starsFor(0.49)).toBe(0);
    expect(starsFor(0.5)).toBe(1);
    expect(starsFor(0.7)).toBe(2);
    expect(starsFor(0.9)).toBe(3);
    expect(starsFor(1)).toBe(3);
  });
});

describe('isUnlocked', () => {
  it('com o progresso vazio, só o primeiro está aberto', () => {
    expect(LEVELS.map((_, i) => isUnlocked(i, {}))).toEqual([true, false, false]);
  });

  it('uma estrela no anterior abre o seguinte', () => {
    const progress = { pop: { stars: 1, points: 0, accuracy: 0.5 } };
    expect(LEVELS.map((_, i) => isUnlocked(i, progress))).toEqual([true, true, false]);
  });

  it('sem estrelas no anterior, o seguinte continua fechado', () => {
    const progress = { pop: { stars: 0, points: 0, accuracy: 0.3 } };
    expect(isUnlocked(1, progress)).toBe(false);
  });
});

describe('LEVELS', () => {
  it('ids únicos', () => {
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
  });

  it("levelIndex('lofi') é o segundo nível", () => {
    expect(levelIndex('lofi')).toBe(1);
  });
});
