import { describe, expect, it } from 'vitest';
import { Judge, NOTE_GOOD, NOTE_MISS, NOTE_PENDING, NOTE_PERFECT } from './judge';

describe('Judge', () => {
  it('janelas: Perfeito ±0,10, Bom ±0,20, Cedo/Tarde até ±0,35', () => {
    const j = () => new Judge([0], [0], 1);
    expect(j().press(0, 0.1)?.kind).toBe('perfect');
    expect(j().press(0, -0.1)?.kind).toBe('perfect');
    expect(j().press(0, 0.15)?.kind).toBe('good');
    expect(j().press(0, 0.2)?.kind).toBe('good');
    expect(j().press(0, 0.21)?.kind).toBe('late');
    expect(j().press(0, -0.21)?.kind).toBe('early');
    expect(j().press(0, 0.35)?.kind).toBe('late');
    expect(j().press(0, 0.36)).toBeNull();
    expect(j().press(0, -0.36)).toBeNull();
  });

  it('Cedo/Tarde não gastam a nota', () => {
    const j = new Judge([0], [0], 1);
    expect(j.press(0, 0.3)).toMatchObject({ kind: 'late', offset: 0.3 });
    expect(j.state[0]).toBe(NOTE_PENDING);
    expect(j.done).toBe(false);
    expect(j.press(0, 0.05)?.kind).toBe('perfect');
    expect(j.done).toBe(true);
  });

  it('entre duas notas fora da janela, diz a mais próxima', () => {
    // 0,27 depois da primeira, 0,23 antes da segunda
    expect(new Judge([1, 1.5], [0, 0], 1).press(0, 1.27)?.kind).toBe('early');
    // 0,23 depois da primeira, 0,27 antes da segunda
    expect(new Judge([1, 1.5], [0, 0], 1).press(0, 1.23)?.kind).toBe('late');
  });

  it('um toque julga só uma nota, a mais antiga da faixa', () => {
    const j = new Judge([1, 1.1, 1.2], [0, 0, 1], 2);
    const h = j.press(0, 1.05);
    expect(h && 'index' in h ? h.index : -1).toBe(0);
    expect(j.state[0]).toBe(NOTE_PERFECT);
    const h2 = j.press(0, 1.12);
    expect(h2 && 'index' in h2 ? h2.index : -1).toBe(1);
    expect(j.press(1, 1.35)?.kind).toBe('good');
    expect(j.state[2]).toBe(NOTE_GOOD);
    expect(j.done).toBe(true);
  });

  it('ignora notas já perdidas e procura a seguinte', () => {
    const h = new Judge([1, 1.5], [0, 0], 1).press(0, 1.5);
    expect(h && 'index' in h ? h.index : -1).toBe(1);
  });

  it('toques soltos e faixas inexistentes dão null', () => {
    const j = new Judge([1], [0], 2);
    expect(j.press(1, 1)).toBeNull();
    expect(j.press(5, 1)).toBeNull();
    expect(j.press(0, 0.5)).toBeNull();
    expect(j.state[0]).toBe(NOTE_PENDING);
  });

  it('sweep marca como falhadas as notas que passaram a janela do Bom', () => {
    const j = new Judge([1, 2, 3], [0, 0, 0], 1);
    j.press(0, 2);
    expect(j.sweep(1.15)).toEqual([]);
    expect(j.sweep(2.5)).toEqual([0]);
    expect(j.state[0]).toBe(NOTE_MISS);
    expect(j.sweep(3.25)).toEqual([2]);
    expect(j.done).toBe(true);
  });
});
