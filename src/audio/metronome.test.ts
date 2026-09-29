import { describe, expect, it } from 'vitest';
import { Clock, clampBpm, quantizeTime, TapTempo } from './metronome';

describe('quantização', () => {
  it('sem quantização toca já', () => {
    expect(quantizeTime(1.234, 0, 120, 'off')).toBe(1.234);
  });
  it('1/16 a 120 BPM = grelha de 125 ms', () => {
    expect(quantizeTime(0.01 + 0.05, 0.01, 120, '1/16')).toBeCloseTo(0.135);
    expect(quantizeTime(0.2, 0, 120, '1/16')).toBeCloseTo(0.25);
  });
  it('1/8 a 120 BPM = grelha de 250 ms', () => {
    expect(quantizeTime(0.1, 0, 120, '1/8')).toBeCloseTo(0.25);
    expect(quantizeTime(0.3, 0, 120, '1/8')).toBeCloseTo(0.5);
  });
  it('mesmo depois de um ponto da grelha, toca já (tolerância)', () => {
    expect(quantizeTime(0.255, 0, 120, '1/8')).toBe(0.255);
  });
  it('nunca devolve um tempo no passado', () => {
    for (let t = 0; t < 3; t += 0.037)
      expect(quantizeTime(t, 0.02, 97, '1/16')).toBeGreaterThanOrEqual(t);
  });
});

describe('relógio', () => {
  function fakeClock() {
    let now = 0;
    let fn: (() => void) | null = null;
    const c = new Clock({
      now: () => now,
      setInterval: (f) => ((fn = f), 1),
      clearInterval: () => (fn = null),
    });
    return {
      c,
      advance(t: number) {
        now = t;
        fn?.();
      },
    };
  }
  it('agenda os passos com antecedência e sem falhas', () => {
    const { c, advance } = fakeClock();
    const steps: { step: number; time: number }[] = [];
    c.on('step', (s) => steps.push(s));
    c.start();
    for (let t = 0; t < 2; t += 0.025) advance(t);
    // 2 s a 120 BPM = 16 semicolcheias (+ antecedência)
    expect(steps.length).toBeGreaterThanOrEqual(16);
    steps.forEach((s, k) => {
      expect(s.step).toBe(k);
      expect(s.time).toBeCloseTo(0.05 + k * 0.125, 6);
    });
  });
  it('mudar o BPM mantém a continuidade', () => {
    const { c, advance } = fakeClock();
    const times: number[] = [];
    c.on('step', (s) => times.push(s.time));
    c.start();
    advance(0.5);
    c.setBpm(60);
    advance(1.5);
    for (let k = 1; k < times.length; k++) expect(times[k]).toBeGreaterThan(times[k - 1]);
    expect(times[times.length - 1] - times[times.length - 2]).toBeCloseTo(0.25);
  });
  it('próximo compasso', () => {
    const { c } = fakeClock();
    c.start();
    expect(c.nextBarTime(0.1)).toEqual({ time: 0.05 + 2, step: 16 });
  });
});

describe('tap tempo', () => {
  it('média dos intervalos', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(500)).toBe(120);
    expect(t.tap(1000)).toBe(120);
  });
  it('recomeça depois de uma pausa', () => {
    const t = new TapTempo();
    t.tap(0);
    t.tap(1000);
    expect(t.tap(5000)).toBeNull();
    expect(t.tap(5400)).toBe(150);
  });
  it('limites de 60 a 180', () => {
    expect(clampBpm(20)).toBe(60);
    expect(clampBpm(400)).toBe(180);
  });
});
