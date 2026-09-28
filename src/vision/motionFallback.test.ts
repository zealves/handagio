import { describe, expect, it } from 'vitest';
import { MotionDetector } from './motionFallback';

describe('motionFallback', () => {
  it('conta píxeis alterados por coluna', () => {
    const a = new Uint8ClampedArray(160 * 120 * 4);
    const b = new Uint8ClampedArray(a);
    // muda um bloco na primeira coluna (x < 20) e na última (x >= 140)
    for (let y = 0; y < 80; y++)
      for (const x of [4, 150]) {
        const k = (y * 160 + x) * 4;
        b[k] = b[k + 1] = b[k + 2] = 255;
      }
    const s = MotionDetector.zoneSums(b, a, 8);
    expect(s[0]).toBe(40);
    expect(s[7]).toBe(40);
    expect(s.slice(1, 7).every((v) => v === 0)).toBe(true);
  });
  it('sem fotograma anterior não há movimento', () => {
    const a = new Uint8ClampedArray(160 * 120 * 4);
    expect(MotionDetector.zoneSums(a, null, 8)).toEqual(new Array(8).fill(0));
  });
});
