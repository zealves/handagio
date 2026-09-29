import { describe, expect, it } from 'vitest';
import { SAMPLED_BY_ID } from './catalog';
import { chooseVoice, loopPoints } from './sampler';

describe('chooseVoice', () => {
  const violin = SAMPLED_BY_ID.violin;
  it('amostras só quando estão prontas', () => {
    expect(chooseVoice('ready', violin)).toBe('sample');
  });
  it('reserva enquanto não há amostras', () => {
    expect(chooseVoice('idle', violin)).toBe('fallback');
    expect(chooseVoice('loading', violin)).toBe('fallback');
    expect(chooseVoice('error', violin)).toBe('fallback');
  });
  it('sem definição de amostras é sempre reserva (patch sintetizado)', () => {
    expect(chooseVoice('ready', undefined)).toBe('fallback');
  });
});

describe('loopPoints', () => {
  it('45%–90% da parte com som, depois do silêncio inicial', () => {
    const { start, end } = loopPoints(3.025, 0.025);
    expect(start).toBeCloseTo(0.025 + 0.45 * 3);
    expect(end).toBeCloseTo(0.025 + 0.9 * 3);
  });
});
