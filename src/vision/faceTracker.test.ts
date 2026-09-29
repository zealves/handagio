import { describe, expect, it } from 'vitest';
import { mouthOpenness } from './faceTracker';
import type { Pt } from './types';

function face(gap: number, width = 0.1): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[61] = { x: 0.5 - width / 2, y: 0.7, z: 0 };
  lm[291] = { x: 0.5 + width / 2, y: 0.7, z: 0 };
  lm[13] = { x: 0.5, y: 0.7 - gap / 2, z: 0 };
  lm[14] = { x: 0.5, y: 0.7 + gap / 2, z: 0 };
  return lm;
}

describe('abertura da boca', () => {
  it('fechada = 0', () => {
    expect(mouthOpenness(face(0.005))).toBe(0);
  });
  it('bem aberta = 1', () => {
    expect(mouthOpenness(face(0.06))).toBe(1);
  });
  it('mapeamento linear entre os limites', () => {
    // r = 0.305 → (0.305 − 0.08) / 0.45 = 0.5
    expect(mouthOpenness(face(0.0305))).toBeCloseTo(0.5, 5);
  });
  it('não depende da distância à câmara', () => {
    expect(mouthOpenness(face(0.0305))).toBeCloseTo(mouthOpenness(face(0.061, 0.2)), 5);
  });
});
