import { describe, expect, it } from 'vitest';
import { degreeToMidi } from '../audio/theory';
import { activeScreenOrder, fingerDegree, fingerDegreeFor, isActive, slotOf } from './fingerMap';

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

  it('tónica no indicador direito: igual ao fingerDegree', () => {
    for (const thumbs of [false, true])
      for (let i = 0; i < 10; i++)
        expect(fingerDegreeFor(i, thumbs, 'right-index')).toBe(fingerDegree(i, thumbs));
  });

  it('tónica no mindinho esquerdo, sem polegares: 0..7 da esquerda para a direita', () => {
    const degs = activeScreenOrder(false).map((i) => fingerDegreeFor(i, false, 'left-pinky'));
    expect(degs).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(fingerDegreeFor(4, false, 'left-pinky')).toBe(0);
  });

  it('tónica no mindinho esquerdo, com polegares: 0..9', () => {
    const degs = activeScreenOrder(true).map((i) => fingerDegreeFor(i, true, 'left-pinky'));
    expect(degs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('mindinho esquerdo toca a tónica na oitava base', () => {
    const t = { root: 0, scale: 'Pentatónica' as const, octave: 4 };
    expect(degreeToMidi(fingerDegreeFor(4, false, 'left-pinky'), t)).toBe(60);
    expect(degreeToMidi(fingerDegreeFor(4, true, 'left-pinky'), t)).toBe(60);
  });
});
