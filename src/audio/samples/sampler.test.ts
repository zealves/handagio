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

// ---------- AudioParam falso: grava as automações e calcula o valor em cada instante ----------
type Ev =
  | { type: 'set'; time: number; value: number }
  | { type: 'ramp'; time: number; value: number }
  | { type: 'target'; time: number; value: number; tau: number };

class FakeParam {
  intrinsic: number;
  events: Ev[] = [];
  constructor(
    v: number,
    private clock: { currentTime: number },
  ) {
    this.intrinsic = v;
  }
  get value() {
    return this.at(this.clock.currentTime);
  }
  set value(v: number) {
    this.intrinsic = v;
  }
  private add(e: Ev) {
    this.events.push(e);
    this.events.sort((a, b) => a.time - b.time);
    return this;
  }
  setValueAtTime(value: number, time: number) {
    return this.add({ type: 'set', time, value });
  }
  linearRampToValueAtTime(value: number, time: number) {
    return this.add({ type: 'ramp', time, value });
  }
  setTargetAtTime(value: number, time: number, tau: number) {
    return this.add({ type: 'target', time, value, tau });
  }
  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
  /** Valor em `x`, segundo as regras do Web Audio para estes três tipos de evento. */
  at(x: number): number {
    let cur = (_: number) => this.intrinsic;
    let lastT = -Infinity;
    for (const e of this.events) {
      if (e.type === 'ramp') {
        const v0 = cur(lastT === -Infinity ? e.time : lastT);
        if (x < e.time) {
          if (lastT === -Infinity || x < lastT) return cur(x);
          return v0 + ((e.value - v0) * (x - lastT)) / (e.time - lastT);
        }
        cur = () => e.value;
        lastT = e.time;
        continue;
      }
      if (e.time > x) break;
      if (e.type === 'set') {
        cur = () => e.value;
      } else {
        const v0 = cur(e.time);
        const { time, value, tau } = e;
        cur = (y) => value + (v0 - value) * Math.exp(-(y - time) / tau);
      }
      lastT = e.time;
    }
    return cur(x);
  }
}

function fakeCtx() {
  const clock = { currentTime: 0 };
  const node = () => ({ connect() {}, disconnect() {} });
  const gains: FakeParam[] = [];
  const stops: number[] = [];
  const ctx = {
    get currentTime() {
      return clock.currentTime;
    },
    createBufferSource: () => ({
      ...node(),
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      playbackRate: new FakeParam(1, clock),
      start() {},
      stop: (at: number) => stops.push(at),
      onended: null,
    }),
    createBiquadFilter: () => ({
      ...node(),
      type: 'lowpass',
      frequency: new FakeParam(350, clock),
      Q: new FakeParam(1, clock),
    }),
    createGain: () => {
      // o GainNode real começa com o valor intrínseco 1
      const gain = new FakeParam(1, clock);
      gains.push(gain);
      return { ...node(), gain };
    },
    createStereoPanner: () => ({ ...node(), pan: new FakeParam(0, clock) }),
  };
  return { ctx: ctx as unknown as BaseAudioContext, clock, gains, stops };
}

const entry: SampleEntry = {
  notes: [69],
  buffers: new Map([[69, { duration: 3 } as AudioBuffer]]),
  offsets: new Map([[69, 0.025]]),
  gain: 0.8,
};

/** Pico do ganho entre 0 e 3 s, em passos de 0,5 ms. */
function peakOf(p: FakeParam): number {
  let m = 0;
  for (let x = 0; x <= 3; x += 0.0005) m = Math.max(m, p.at(x));
  return m;
}

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
