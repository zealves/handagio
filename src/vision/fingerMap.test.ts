import { describe, expect, it } from 'vitest';
import { degreeToMidi } from '../audio/theory';
import { activeScreenOrder, fingerDegree, isActive, slotOf } from './fingerMap';

describe('mapeamento de dedos', () => {
  it('sem polegares tocam 8 dedos', () => {
    const act = Array.from({ length: 10 }, (_, i) => isActive(i, false));
    expect(act.filter(Boolean)).toHaveLength(8);
    expect(act[0]).toBe(false);
    expect(act[5]).toBe(false);
    expect(activeScreenOrder(false)).toEqual([4, 3, 2, 1, 6, 7, 8, 9]);
  });

  it('com polegares tocam 10', () => {
    expect(activeScreenOrder(true)).toEqual([4, 3, 2, 1, 0, 5, 6, 7, 8, 9]);
  });

  it('sem polegares: graus seguidos do mindinho esquerdo ao mindinho direito', () => {
    const degs = activeScreenOrder(false).map((i) => fingerDegree(i, false));
    expect(degs).toEqual([-4, -3, -2, -1, 0, 1, 2, 3]);
  });

  it('com polegares: graus seguidos, sem saltos', () => {
    const degs = activeScreenOrder(true).map((i) => fingerDegree(i, true));
    expect(degs).toEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4]);
    expect(degs[5]).toBe(0); // polegar direito = tónica
  });

  it('notas sobem da esquerda para a direita', () => {
    const t = { root: 0, scale: 'Maior' as const, octave: 4 };
    const midis = activeScreenOrder(false).map((i) => degreeToMidi(fingerDegree(i, false), t));
    for (let k = 1; k < midis.length; k++) expect(midis[k]).toBeGreaterThan(midis[k - 1]);
    expect(midis[4]).toBe(60); // indicador direito = tónica (Dó)
  });

  it('slots da percussão', () => {
    expect([1, 2, 3, 4, 6, 7, 8, 9].map((i) => slotOf(i, false))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(slotOf(0, false)).toBe(-1);
    expect(slotOf(7, true)).toBe(7);
  });
});
