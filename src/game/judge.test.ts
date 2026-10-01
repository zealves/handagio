import { describe, expect, it } from 'vitest';
import { Judge, NOTE_GOOD, NOTE_MISS, NOTE_PENDING, NOTE_PERFECT } from './judge';

describe('Judge', () => {
  it('janelas do Perfeito e do Bom, com os limites incluídos', () => {
    const j = () => new Judge([0], [0], 1);
    expect(j().press(0, 0.07)?.judgement).toBe('perfect');
    expect(j().press(0, -0.07)?.judgement).toBe('perfect');
    expect(j().press(0, 0.1)?.judgement).toBe('good');
    expect(j().press(0, 0.15)?.judgement).toBe('good');
    expect(j().press(0, 0.16)).toBeNull();
    expect(j().press(0, -0.16)).toBeNull();
  });

  it('o offset é toque − nota (positivo = tarde)', () => {
    expect(new Judge([2], [0], 1).press(0, 2.05)?.offset).toBeCloseTo(0.05);
  });

  it('um toque julga só uma nota, a mais antiga da faixa', () => {
    const j = new Judge([1, 1.1, 1.2], [0, 0, 1], 2);
    const h = j.press(0, 1.05);
    expect(h?.index).toBe(0);
    expect(j.state[0]).toBe(NOTE_PERFECT);
    expect(j.state[1]).toBe(NOTE_PENDING);
    expect(j.press(0, 1.12)?.index).toBe(1);
    expect(j.press(0, 1.12)).toBeNull();
    expect(j.press(1, 1.3)?.judgement).toBe('good');
    expect(j.state[2]).toBe(NOTE_GOOD);
    expect(j.done).toBe(true);
  });

  it('ignora notas já perdidas e procura a seguinte', () => {
    const j = new Judge([1, 1.5], [0, 0], 1);
    expect(j.press(0, 1.5)?.index).toBe(1);
  });

  it('toques soltos e faixas inexistentes dão null', () => {
    const j = new Judge([1], [0], 2);
    expect(j.press(1, 1)).toBeNull();
    expect(j.press(5, 1)).toBeNull();
    expect(j.press(0, 0.5)).toBeNull();
    expect(j.state[0]).toBe(NOTE_PENDING);
  });

  it('sweep marca como falhadas as notas que passaram a janela', () => {
    const j = new Judge([1, 2, 3], [0, 0, 0], 1);
    j.press(0, 2);
    expect(j.sweep(1.15)).toEqual([]);
    expect(j.sweep(2.5)).toEqual([0]);
    expect(j.state[0]).toBe(NOTE_MISS);
    expect(j.sweep(3.2)).toEqual([2]);
    expect(j.done).toBe(true);
    expect(j.sweep(9)).toEqual([]);
  });
});
