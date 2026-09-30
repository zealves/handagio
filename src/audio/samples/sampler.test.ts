import { describe, expect, it } from 'vitest';
import { SAMPLED_BY_ID } from './catalog';
import type { SampleEntry } from './loader';
import {
  chooseVoice,
  CHOKE_OTHER,
  CHOKE_SAME,
  loopPoints,
  playSample,
  samplePeak,
} from './sampler';
import { fakeCtx, peakOf } from '../testing/fakeAudio';

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

describe('samplePeak', () => {
  it('aplica o ajuste em dB', () => {
    expect(samplePeak(1, 0, 1)).toBeCloseTo(0.5);
    expect(samplePeak(1, 20, 1)).toBeCloseTo(5);
    expect(samplePeak(0.8, -6, 0.5)).toBeCloseTo(0.8 * 0.5 * 0.5012 * 0.575, 3);
  });
});

const entry: SampleEntry = {
  notes: [69],
  buffers: new Map([[69, { duration: 3 } as AudioBuffer]]),
  offsets: new Map([[69, 0.025]]),
  gain: 0.8,
};

describe('playSample: ganho nunca passa do pico previsto', () => {
  const vel = 0.8;
  for (const kind of ['violin', 'piano', 'harp'] as const) {
    const def = SAMPLED_BY_ID[kind];
    const intended = samplePeak(entry.gain, def.level, vel);
    const setup = (when: number) => {
      const f = fakeCtx();
      const v = playSample(f.ctx, entry, def, {} as AudioNode, 440, vel, 0, when);
      return { ...f, v, g: f.gains[0] };
    };
    it(`${kind}: sem cortes soa ao pico previsto`, () => {
      const { g } = setup(0.1);
      expect(peakOf(g)).toBeCloseTo(intended, 6);
    });
    for (const at of [0.05, 0.1]) {
      it(`${kind}: abafada em ${at} s, antes ou no início (0,1 s), não soa nem dá rajada`, () => {
        const { g, v, stops } = setup(0.1);
        v.choke(at, CHOKE_SAME);
        expect(peakOf(g)).toBeLessThanOrEqual(1e-9);
        expect(stops.at(-1)).toBeCloseTo(0.1);
      });
    }
    it(`${kind}: kill antes do início não soa nem dá rajada`, () => {
      const { g, v, clock } = setup(0.1);
      clock.currentTime = 0.02;
      v.kill();
      expect(peakOf(g)).toBeLessThanOrEqual(1e-9);
    });
    it(`${kind}: abafada durante o ataque não passa do pico`, () => {
      const { g, v, clock } = setup(0.1);
      clock.currentTime = 0.102;
      v.choke(0.102, CHOKE_OTHER);
      expect(peakOf(g)).toBeLessThanOrEqual(intended + 1e-9);
    });
    it(`${kind}: largada e depois abafada não passa do pico`, () => {
      const { g, v, clock } = setup(0.1);
      v.release();
      clock.currentTime = 0.2;
      v.choke(0.2, CHOKE_SAME);
      clock.currentTime = 0.3;
      v.kill();
      expect(peakOf(g)).toBeLessThanOrEqual(intended + 1e-9);
    });
  }
});

describe('playSample: choke nunca prolonga uma descida mais rápida', () => {
  it('uma descida lenta não substitui a rápida já agendada', () => {
    const f = fakeCtx();
    const v = playSample(f.ctx, entry, SAMPLED_BY_ID.violin, {} as AudioNode, 440, 0.8, 0, 0);
    f.clock.currentTime = 1;
    v.choke(1, CHOKE_SAME);
    const lastStop = f.stops.at(-1)!;
    v.choke(1.05, CHOKE_OTHER);
    expect(f.stops.at(-1)).toBe(lastStop);
    expect(lastStop).toBeCloseTo(1 + CHOKE_SAME * 6);
  });
});

describe('playSample: choke nunca é mais lento do que a libertação do instrumento', () => {
  it('largada (descida aos 250 ms) e abafada antes com CHOKE_OTHER acaba até ao fim da libertação', () => {
    const f = fakeCtx();
    const def = SAMPLED_BY_ID.violin;
    const v = playSample(f.ctx, entry, def, {} as AudioNode, 440, 0.8, 0, 0);
    f.clock.currentTime = 0.05;
    v.release();
    const releaseEnd = 0.25 + def.rel * 6;
    expect(f.stops.at(-1)).toBeCloseTo(releaseEnd);
    f.clock.currentTime = 0.1;
    v.choke(0.1, CHOKE_OTHER);
    expect(f.stops.at(-1)!).toBeLessThanOrEqual(releaseEnd + 1e-9);
    const g = f.gains[0];
    // a descida usa a constante do instrumento, não a de 0,25 s
    expect(g.at(0.1 + def.rel)).toBeCloseTo(g.at(0.1) * Math.exp(-1), 4);
  });
  it('beliscado mantém a cauda natural de CHOKE_OTHER', () => {
    const f = fakeCtx();
    const v = playSample(f.ctx, entry, SAMPLED_BY_ID.harp, {} as AudioNode, 440, 0.8, 0, 0);
    f.clock.currentTime = 0.5;
    v.choke(0.5, CHOKE_OTHER);
    expect(f.stops.at(-1)).toBeCloseTo(0.5 + CHOKE_OTHER * 6);
  });
});

describe('playSample: cancelIfPending (mudança de instrumento, oitava ou escala)', () => {
  for (const kind of ['violin', 'piano', 'harp'] as const) {
    const def = SAMPLED_BY_ID[kind];
    it(`${kind}: agendada para o futuro, corta sem som e para no início`, () => {
      const f = fakeCtx();
      const v = playSample(f.ctx, entry, def, {} as AudioNode, 440, 0.8, 0, 0.5);
      f.clock.currentTime = 0.1;
      expect(v.cancelIfPending()).toBe(true);
      expect(peakOf(f.gains[0])).toBeLessThanOrEqual(1e-9);
      expect(f.stops.at(-1)).toBeCloseTo(0.5);
      // depois de cortada, largar não a faz voltar
      v.release();
      expect(peakOf(f.gains[0])).toBeLessThanOrEqual(1e-9);
    });
    it(`${kind}: já a soar, não faz nada`, () => {
      const f = fakeCtx();
      const v = playSample(f.ctx, entry, def, {} as AudioNode, 440, 0.8, 0, 0.1);
      f.clock.currentTime = 0.2;
      const stops = f.stops.length;
      expect(v.cancelIfPending()).toBe(false);
      expect(f.stops.length).toBe(stops);
      expect(peakOf(f.gains[0])).toBeCloseTo(samplePeak(entry.gain, def.level, 0.8), 6);
    });
    it(`${kind}: largada antes do início (toque curto quantizado) ainda soa`, () => {
      const f = fakeCtx();
      const v = playSample(f.ctx, entry, def, {} as AudioNode, 440, 0.8, 0, 0.5);
      f.clock.currentTime = 0.1;
      v.release();
      expect(peakOf(f.gains[0])).toBeGreaterThan(0.1);
    });
  }
});
