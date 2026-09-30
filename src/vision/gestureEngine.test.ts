import { describe, expect, it } from 'vitest';
import {
  GestureEngine,
  onThreshold,
  THUMB_DWELL,
  THUMB_DWELL_MIN,
  THUMB_ON_EXTRA,
  thresholds,
  thumbThresholds,
  velocityFrom,
  type GestureOptions,
} from './gestureEngine';
import { syntheticHand } from './testHands';
import type { AssignedHands, Pt } from './types';

const opts: GestureOptions = {
  sensitivity: 0.55,
  thumbs: false,
  heightPitch: false,
  glide: false,
  continuous: false,
};
const open: AssignedHands = [syntheticHand(false, 0.3), syntheticHand(false, 0.7)];
const closeIdx = (k: number): AssignedHands => {
  const c = [false, false, false, false, false];
  c[k] = true;
  return [syntheticHand(c, 0.3), syntheticHand(false, 0.7)];
};

function record(g: GestureEngine) {
  const ev: string[] = [];
  g.on('noteOn', (e) => ev.push(`on${e.finger}`));
  g.on('noteOff', (e) => ev.push(`off${e.finger}`));
  return ev;
}

describe('gestureEngine', () => {
  it('limiar a partir da sensibilidade', () => {
    expect(onThreshold(0)).toBeCloseTo(0.75);
    expect(onThreshold(1)).toBeCloseTo(0.3);
    const t = thresholds(1, 0.55);
    expect(t.on - t.off).toBeCloseTo(0.18);
  });

  it('dispara ao dobrar depressa e liberta ao esticar', () => {
    const g = new GestureEngine();
    const ev = record(g);
    for (let k = 0; k < 5; k++) g.process(open, 1 / 30, opts);
    for (let k = 0; k < 5; k++) g.process(closeIdx(1), 1 / 30, opts);
    expect(ev).toEqual(['on1']);
    for (let k = 0; k < 5; k++) g.process(open, 1 / 30, opts);
    expect(ev).toEqual(['on1', 'off1']);
  });

  it('não dispara duas vezes sem libertar', () => {
    const g = new GestureEngine();
    const ev = record(g);
    g.process(open, 1 / 30, opts);
    for (let k = 0; k < 30; k++) g.process(k % 2 ? closeIdx(2) : closeIdx(2), 1 / 30, opts);
    expect(ev.filter((e) => e === 'on2')).toHaveLength(1);
  });

  it('histerese: dobras entre os limiares não libertam', () => {
    const g = new GestureEngine();
    const ev = record(g);
    const f = g.fingers[3];
    f.down = true;
    // curl fica entre off e on → não liberta
    const { on, off } = thresholds(3, opts.sensitivity);
    f.curl = (on + off) / 2;
    expect(f.curl).toBeGreaterThan(off);
    ev.length = 0;
    g.process(closeIdx(3), 1 / 30, opts);
    expect(ev).not.toContain('off3');
  });

  it('dobra lenta não dispara (velocidade < 0.3)', () => {
    const g = new GestureEngine();
    const ev = record(g);
    g.process(open, 1 / 30, opts);
    // dt enorme → velocidade baixa
    for (let k = 0; k < 5; k++) g.process(closeIdx(1), 10, opts);
    expect(ev).toEqual([]);
  });

  it('polegar não faz nada por defeito', () => {
    const g = new GestureEngine();
    const ev = record(g);
    const thumbClosed: AssignedHands = [
      syntheticHand([true, false, false, false, false], 0.3),
      syntheticHand(false, 0.7),
    ];
    g.process(open, 1 / 30, opts);
    for (let k = 0; k < 5; k++) g.process(thumbClosed, 1 / 30, opts);
    expect(ev).toEqual([]);
    const g2 = new GestureEngine();
    const ev2 = record(g2);
    g2.process(open, 1 / 30, { ...opts, thumbs: true });
    for (let k = 0; k < 5; k++) g2.process(thumbClosed, 1 / 30, { ...opts, thumbs: true });
    expect(ev2).toEqual(['on0']);
  });

  it('perder a mão liberta as notas', () => {
    const g = new GestureEngine();
    const ev = record(g);
    g.process(open, 1 / 30, opts);
    for (let k = 0; k < 3; k++) g.process(closeIdx(1), 1 / 30, opts);
    g.process([null, null], 1 / 30, opts);
    expect(ev).toEqual(['on1', 'off1']);
  });

  it('intensidade entre 0.2 e 1', () => {
    expect(velocityFrom(0.3)).toBeCloseTo(0.2);
    expect(velocityFrom(5.3)).toBeCloseTo(1);
    expect(velocityFrom(100)).toBe(1);
  });

  it('velocidade é a derivada suavizada da dobra', () => {
    const g = new GestureEngine();
    g.process(open, 0.1, opts);
    g.process(closeIdx(1), 0.1, opts);
    const f = g.fingers[1];
    expect(f.vel).toBeCloseTo(((f.curl - f.prevCurl) / 0.1) * 0.5, 5);
  });

  describe('polegares', () => {
    const topts: GestureOptions = { ...opts, thumbs: true };
    const thumbAt = (t: number): AssignedHands => {
      // polegar esquerdo a meio caminho entre esticado (t = 0) e dobrado (t = 1)
      const a = syntheticHand(false, 0.3);
      const b = syntheticHand([true, false, false, false, false], 0.3);
      const lm = a.map((p, k): Pt => ({
        x: p.x + (b[k].x - p.x) * t,
        y: p.y + (b[k].y - p.y) * t,
        z: p.z + (b[k].z - p.z) * t,
      }));
      return [lm, syntheticHand(false, 0.7)];
    };

    it('limiar próprio, mais alto e deslocado pela sensibilidade dos polegares', () => {
      const t = thumbThresholds(0, 0.5);
      expect(t.on).toBeCloseTo(onThreshold(0.5) + THUMB_ON_EXTRA);
      expect(t.on - t.off).toBeCloseTo(0.18);
      expect(thumbThresholds(0, 1).on).toBeLessThan(t.on);
      expect(thumbThresholds(0, 0).on).toBeGreaterThan(t.on);
      expect(t.on).toBeGreaterThan(thresholds(0, opts.sensitivity).on);
    });

    it('calibrado: vem dos valores do polegar e nunca passa de 85% do caminho', () => {
      const cal = { open: Array(10).fill(0.2), closed: Array(10).fill(0.5) };
      const t = thumbThresholds(0, 0.5, cal);
      expect(t.on).toBeLessThanOrEqual(0.2 + 0.3 * 0.85 + 1e-9);
      expect(t.on).toBeGreaterThan(0.2 + 0.3 * 0.6);
      expect(t.off).toBeGreaterThanOrEqual(0.2 + 0.3 * 0.15);
    });

    it(`dobrado um só fotograma não dispara; ${THUMB_DWELL} seguidos disparam`, () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 50, topts);
      g.process(thumbAt(1), 1 / 50, topts);
      // o polegar passa o limiar neste fotograma, mas ainda não confirmou
      expect(g.fingers[0].curl).toBeGreaterThan(thumbThresholds(0, 0.5).on);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 50, topts);
      expect(ev).toEqual([]);
      for (let k = 0; k < THUMB_DWELL - 1; k++) g.process(thumbAt(1), 1 / 50, topts);
      expect(ev).toEqual([]);
      g.process(thumbAt(1), 1 / 50, topts);
      expect(ev).toEqual(['on0']);
    });

    /** Fotograma (1 = o primeiro acima do limiar) em que o polegar dispara, a `fps`. */
    const fireFrame = (fps: number): number => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / fps, topts);
      for (let k = 1; k <= 10; k++) {
        g.process(thumbAt(1), 1 / fps, topts);
        if (ev.length) return k;
      }
      return -1;
    };

    it('a 60 fps dispara ao 3.º fotograma (~33 ms depois do primeiro)', () => {
      expect(fireFrame(60)).toBe(THUMB_DWELL);
    });

    it('a 15 fps dispara ao 2.º fotograma (~67 ms), não ao 3.º (133 ms)', () => {
      expect(fireFrame(15)).toBe(THUMB_DWELL_MIN);
    });

    it('a 15 fps, um só fotograma acima continua a não disparar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 15, topts);
      g.process(thumbAt(1), 1 / 15, topts);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 15, topts);
      expect(ev).toEqual([]);
    });

    it('intensidade do disparo é a do primeiro fotograma acima do limiar', () => {
      const g = new GestureEngine();
      let vel = 0;
      g.on('noteOn', (e) => (vel = e.velocity));
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 50, topts);
      g.process(thumbAt(1), 1 / 50, topts);
      const first = velocityFrom(g.fingers[0].vel);
      for (let k = 1; k < THUMB_DWELL; k++) g.process(thumbAt(1), 1 / 50, topts);
      expect(vel).toBeCloseTo(first);
    });

    it('a oscilar à volta do limiar antigo não dispara', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const old = onThreshold(opts.sensitivity); // o limiar que os polegares usavam
      let lo = 1;
      let hi = 0;
      for (let k = 0; k < 60; k++) {
        g.process(thumbAt(k % 2 ? 0.45 : 0.2), 1 / 30, topts);
        if (k > 10) {
          lo = Math.min(lo, g.fingers[0].curl);
          hi = Math.max(hi, g.fingers[0].curl);
        }
      }
      expect(lo).toBeLessThan(old);
      expect(hi).toBeGreaterThan(old);
      expect(ev).toEqual([]);
    });

    it('os outros dedos disparam logo no primeiro fotograma acima do limiar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 3; k++) g.process(open, 1 / 30, topts);
      g.process(closeIdx(1), 1 / 30, topts);
      expect(ev).toEqual(['on1']);
    });
  });
});
