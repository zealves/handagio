import { describe, expect, it } from 'vitest';
import { limiterTrim, LIMIT_DB, LIMIT_RATIO } from './limiter';

describe('limitador', () => {
  it('anula a compensação automática do compressor', () => {
    // −2 dBFS, 20:1 → a curva dá −1,9 dB a 0 dBFS; a compensação é +1,14 dB
    expect(limiterTrim(-2, 20)).toBeCloseTo(Math.pow(10, (-1.9 * 0.6) / 20), 6);
    expect(limiterTrim(LIMIT_DB, LIMIT_RATIO)).toBeLessThan(1);
    expect(limiterTrim(0, 20)).toBe(1);
  });
});
