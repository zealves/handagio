import { describe, expect, it } from 'vitest';
import { usableRange } from './adaptive';
import { curls } from './fingerCurl';
import {
  COUPLED_DOMINANCE,
  CURL_SMOOTH_PREV,
  defaultThresholds,
  DRAG_DEADZONE,
  DRAG_SEMITONES,
  dragSemitones,
  EARLY_FRACTION,
  EARLY_VEL,
  FINGER_ON_DISCOUNT,
  GestureEngine,
  HYSTERESIS,
  LEARN_MAX_DROP,
  LEARN_OFF_FRAC,
  LEARN_ON_FRAC,
  learnedThresholds,
  heightShiftOf,
  onThreshold,
  THUMB_DWELL,
  THUMB_DWELL_MIN,
  THUMB_ON_EXTRA,
  thresholds,
  thumbThresholds,
  REFRACTORY_S,
  VEL_SMOOTH_PREV,
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

  it('suavização leve da dobra e velocidade a partir da dobra crua', () => {
    const g = new GestureEngine();
    g.process(open, 0.1, opts);
    g.process(open, 0.1, opts);
    g.process(closeIdx(1), 0.1, opts);
    const f = g.fingers[1];
    const raw = curls(closeIdx(1)[0]!)[1];
    expect(f.raw).toBeCloseTo(raw, 6);
    expect(f.rawVel).toBeCloseTo(raw / 0.1, 5);
    expect(f.curl).toBeCloseTo(raw * (1 - CURL_SMOOTH_PREV), 6);
    expect(f.vel).toBeCloseTo((raw / 0.1) * (1 - VEL_SMOOTH_PREV), 5);
    // a velocidade não vem da dobra suavizada
    expect(f.vel).not.toBeCloseTo(((f.curl - f.prevCurl) / 0.1) * 0.5, 2);
  });

  it('mão que acabou de aparecer não dispara, mesmo com o dedo dobrado', () => {
    const g = new GestureEngine();
    const ev = record(g);
    g.process(closeIdx(1), 1 / 30, opts);
    g.process(closeIdx(1), 1 / 30, opts);
    expect(ev).toEqual([]);
    expect(g.fingers[1].curl).toBeCloseTo(curls(closeIdx(1)[0]!)[1], 6);
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
  describe('altura da mão e arrastar', () => {
    /** Mãos com o indicador esquerdo dobrado (ou não) e o pulso à altura `y`. */
    const at = (bent: boolean, y: number): AssignedHands => [
      syntheticHand([false, bent, false, false, false], 0.3, y),
      syntheticHand(false, 0.7, y),
    ];
    function run(o: Partial<GestureOptions>) {
      const g = new GestureEngine();
      const shifts: number[] = [];
      let pitch = NaN;
      g.on('noteOn', (e) => shifts.push(e.shift));
      g.on('glide', (e) => {
        if (e.finger === 1) pitch = e.pitch;
      });
      const oo = { ...opts, ...o };
      const feed = (h: AssignedHands, n = 12) => {
        for (let k = 0; k < n; k++) g.process(h, 1 / 30, oo);
        return pitch;
      };
      return { g, shifts, feed };
    }

    it('desvio: zona morta, sem salto, 20 meios-tons por unidade e limite de ±12', () => {
      expect(dragSemitones(0.7, 0.7)).toBe(0);
      expect(dragSemitones(0.7, 0.7 - DRAG_DEADZONE)).toBeCloseTo(0);
      expect(dragSemitones(0.7, 0.6)).toBeCloseTo((0.1 - DRAG_DEADZONE) * DRAG_SEMITONES);
      expect(dragSemitones(0.6, 0.7)).toBeCloseTo(-(0.1 - DRAG_DEADZONE) * DRAG_SEMITONES);
      expect(dragSemitones(0.9, 0)).toBe(12);
      expect(dragSemitones(0, 0.9)).toBe(-12);
    });

    it('altura escolhe a nota: 10 graus por unidade, centro em 0.55', () => {
      expect(heightShiftOf(0.55)).toBe(0);
      expect(heightShiftOf(0.35)).toBe(2);
      expect(heightShiftOf(0.75)).toBe(-2);
    });

    it('sem altura: arrastar é relativo ao ponto onde a nota começou', () => {
      const { shifts, feed } = run({ heightPitch: false, glide: true });
      feed(at(false, 0.7), 5);
      expect(feed(at(true, 0.7), 5)).toBeCloseTo(0);
      expect(shifts).toEqual([0]);
      expect(feed(at(true, 0.6))).toBeCloseTo(1.6, 2);
      expect(feed(at(true, 0.7))).toBeCloseTo(0, 2);
      // dentro da zona morta, nada
      expect(feed(at(true, 0.7 - DRAG_DEADZONE / 2))).toBeCloseTo(0, 6);
      expect(feed(at(true, 0.8))).toBeCloseTo(-1.6, 2);
    });

    it('com altura: a nota vem da altura e o arrastar continua relativo a ela', () => {
      const { shifts, feed } = run({ heightPitch: true, glide: true });
      feed(at(false, 0.35), 5);
      feed(at(true, 0.35), 5);
      expect(shifts).toEqual([2]);
      expect(feed(at(true, 0.35))).toBeCloseTo(0, 6);
      expect(feed(at(true, 0.25))).toBeCloseTo(1.6, 2);
    });

    it('a suavização não salta logo para o valor final', () => {
      const { feed } = run({ glide: true });
      feed(at(false, 0.7), 5);
      feed(at(true, 0.7), 5);
      expect(feed(at(true, 0.6), 1)).toBeCloseTo(0.8, 2);
    });

    it('sem arrastar não há glide', () => {
      const { feed } = run({ glide: false });
      feed(at(false, 0.7), 5);
      feed(at(true, 0.7), 5);
      expect(feed(at(true, 0.5))).toBeNaN();
    });
  });

  describe('deteção afinada (v2.1)', () => {
    const OPEN = syntheticHand(false, 0.3);
    const CLOSED = syntheticHand(true, 0.3);
    const RIGHT = syntheticHand(false, 0.7);
    const PTS = (j: number) => [2, 3, 4].map((k) => 4 * j + k);
    /** Mão esquerda com a dobra crua de cada dedo (1..4) perto de `c[j]` (bissecção). */
    function handWith(c: number[]): AssignedHands {
      const lm = OPEN.map((p) => ({ ...p }));
      for (let j = 1; j < 5; j++) {
        const at = (t: number) => {
          for (const k of PTS(j))
            lm[k] = {
              x: OPEN[k].x + (CLOSED[k].x - OPEN[k].x) * t,
              y: OPEN[k].y + (CLOSED[k].y - OPEN[k].y) * t,
              z: OPEN[k].z + (CLOSED[k].z - OPEN[k].z) * t,
            };
          return curls(lm)[j];
        };
        let lo = 0;
        let hi = 1;
        for (let k = 0; k < 40; k++) {
          const m = (lo + hi) / 2;
          if (at(m) < (c[j] ?? 0)) lo = m;
          else hi = m;
        }
        at((lo + hi) / 2);
      }
      return [lm, RIGHT];
    }
    const smooth = (x: number) => x * x * (3 - 2 * x);
    /** Fotograma (1 = o primeiro do movimento) em que o dedo j dispara, ou null. */
    function fireFrame(j: number, target: number, ms: number, fps: number, o = opts) {
      const g = new GestureEngine();
      let k = 0;
      let fired: number | null = null;
      g.on('noteOn', (e) => {
        if (e.finger === j && fired === null) fired = k;
      });
      for (k = -10; k <= 0; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / fps, o);
      for (k = 1; k < fps && fired === null; k++) {
        const c = [0, 0, 0, 0, 0];
        c[j] = target * smooth(Math.min(1, (k * 1000) / fps / ms));
        g.process(handWith(c), 1 / fps, o);
      }
      return fired;
    }

    it('descontos por dedo: anelar e mindinho mais fáceis, off coerente', () => {
      expect(FINGER_ON_DISCOUNT).toEqual([0, 0, 0, 0.06, 0.12]);
      const base = onThreshold(0.55);
      for (const j of [1, 2]) expect(thresholds(j, 0.55).on).toBeCloseTo(base);
      expect(thresholds(3, 0.55).on).toBeCloseTo(base - 0.06);
      expect(thresholds(9, 0.55).on).toBeCloseTo(base - 0.12);
      for (let j = 1; j < 5; j++) {
        const t = thresholds(j, 0.55);
        expect(t.off).toBeCloseTo(t.on - HYSTERESIS + FINGER_ON_DISCOUNT[j] / 2);
        expect(t.off).toBeLessThan(t.on);
        expect(t.full).toBeCloseTo(base);
      }
      // sensibilidade no máximo: nunca abaixo de 0.2
      expect(defaultThresholds(4, 1).on).toBeCloseTo(0.2);
    });

    it('mindinho fraco (0 → 0.45 em 200 ms) dispara; antes não chegava ao limiar', () => {
      expect(0.45).toBeLessThan(onThreshold(0.55));
      expect(fireFrame(4, 0.45, 200, 30)).not.toBeNull();
      expect(fireFrame(4, 0.45, 200, 20)).not.toBeNull();
    });

    it('disparo antecipado: uma dobra rápida toca ao 2.º fotograma, antes de passar o on', () => {
      expect(fireFrame(1, 0.9, 150, 30)).toBe(2);
      expect(fireFrame(1, 0.9, 150, 20)).toBe(2);
      // no fotograma do disparo a dobra suavizada ainda não chegou ao limiar
      const g = new GestureEngine();
      let at = -1;
      g.on('noteOn', () => (at = g.fingers[1].curl));
      for (let k = 0; k < 5; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (const v of [0.114, 0.375]) g.process(handWith([0, v, 0, 0, 0]), 1 / 30, opts);
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(thresholds(1, 0.55).on);
      expect(g.fingers[1].raw).toBeGreaterThanOrEqual(thresholds(1, 0.55).full * EARLY_FRACTION);
    });

    it('sem disparo antecipado com um salto isolado ou um tremor abaixo do nível', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 5; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      // salto de um fotograma até 0.45 (acima do nível antecipado, abaixo do on) e volta
      g.process(handWith([0, 0.45, 0, 0, 0]), 1 / 30, opts);
      g.process(handWith([0, 0.05, 0, 0, 0]), 1 / 30, opts);
      expect(ev).toEqual([]);
      // tremor rápido (mais de EARLY_VEL/s) mas sempre abaixo do nível antecipado
      const level = thresholds(4, 0.55).early;
      for (let k = 0; k < 90; k++) {
        const v = (k % 3) * (level / 2.2);
        expect((level / 2.2) * 30).toBeGreaterThan(EARLY_VEL);
        g.process(handWith([0, v, v, v, v]), 1 / 30, opts);
      }
      expect(ev).toEqual([]);
    });

    it('dobra lenta abaixo do limiar não dispara', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 300; k++) {
        const v = 0.05 + 0.25 * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / 15));
        g.process(handWith([0, v, v, v, v]), 1 / 30, opts);
      }
      expect(ev).toEqual([]);
    });

    it('movimento acoplado: o mindinho arrastado pelo anelar não toca pelo desconto', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 5; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      // o mindinho vai a metade da dobra do anelar: passa o on com desconto, não o sem desconto
      for (let k = 1; k <= 20; k++) {
        const t = smooth(Math.min(1, k / 5));
        g.process(handWith([0, 0, 0, 0.9 * t, 0.45 * t]), 1 / 30, opts);
      }
      expect(g.fingers[4].curl).toBeGreaterThan(thresholds(4, 0.55).on);
      expect(g.fingers[4].curl).toBeLessThan(thresholds(4, 0.55).full);
      expect(ev).toEqual(['on3']);
      expect(COUPLED_DOMINANCE).toBeGreaterThan(0.5);
    });

    it('período refratário: não volta a disparar logo depois de soltar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const dt = 1 / 60;
      for (let k = 0; k < 5; k++) g.process(handWith([0, 0, 0, 0, 0]), dt, opts);
      for (let k = 0; k < 4; k++) g.process(handWith([0, 0.9, 0, 0, 0]), dt, opts);
      for (let k = 0; k < 2; k++) g.process(handWith([0, 0.05, 0, 0, 0]), dt, opts);
      expect(ev).toEqual(['on1', 'off1']);
      // volta a dobrar de imediato (tremor): dentro do período refratário não toca
      g.process(handWith([0, 0.9, 0, 0, 0]), dt, opts);
      expect(ev).toEqual(['on1', 'off1']);
      expect(g.fingers[1].refr).toBeGreaterThan(0);
      // passado o período, uma dobra nova toca
      for (let k = 0; k < 6; k++) g.process(handWith([0, 0.05, 0, 0, 0]), dt, opts);
      expect(g.fingers[1].refr).toBe(0);
      expect(REFRACTORY_S).toBeLessThan(6 * dt);
      g.process(handWith([0, 0.9, 0, 0, 0]), dt, opts);
      expect(ev).toEqual(['on1', 'off1', 'on1']);
    });

    it('limiares aprendidos: 55% do caminho, off a 25%, limitados', () => {
      const r = { lo: 0.1, hi: 0.7 };
      const t = learnedThresholds(1, 0.55, r);
      expect(t.on).toBeCloseTo(0.1 + 0.6 * LEARN_ON_FRAC);
      expect(t.off).toBeCloseTo(0.1 + 0.6 * LEARN_OFF_FRAC);
      expect(t.early).toBeCloseTo(0.1 + (t.full - 0.1) * EARLY_FRACTION);
      // mindinho: desconto como fração do caminho
      expect(learnedThresholds(4, 0.55, r).on).toBeCloseTo(0.1 + 0.6 * (LEARN_ON_FRAC - 0.12));
      // nunca mais de LEARN_MAX_DROP abaixo do limiar sem aprendizagem
      const low = learnedThresholds(4, 0.55, { lo: 0, hi: 0.3 });
      expect(low.on).toBeCloseTo(defaultThresholds(4, 0.55).on - LEARN_MAX_DROP);
      // entre 0.2 e 0.9
      expect(learnedThresholds(1, 0, { lo: 0.8, hi: 1 }).on).toBeLessThanOrEqual(0.9);
      expect(learnedThresholds(1, 1, { lo: 0, hi: 0.3 }).on).toBeGreaterThanOrEqual(0.2);
    });

    it('prioridade: calibração > aprendido > defeito', () => {
      const cal = { open: Array(10).fill(0.2), closed: Array(10).fill(0.8) };
      const learned = { lo: 0.05, hi: 0.5 };
      const withCal = thresholds(3, 0.55, cal, learned);
      expect(withCal.on).toBeCloseTo(0.2 + 0.6 * 0.6);
      expect(thresholds(3, 0.55, null, learned).on).toBeCloseTo(
        learnedThresholds(3, 0.55, learned).on,
      );
      // calibração inválida para este dedo: usa o aprendido
      const bad = { open: Array(10).fill(0), closed: Array(10).fill(0) };
      expect(thresholds(3, 0.55, bad, learned).on).toBeCloseTo(
        learnedThresholds(3, 0.55, learned).on,
      );
      // aprendido demasiado estreito: defeito com desconto
      const narrow = { lo: 0.1, hi: 0.3 };
      expect(usableRange(narrow)).toBe(false);
      expect(thresholds(3, 0.55, null, narrow).on).toBeCloseTo(defaultThresholds(3, 0.55).on);
    });

    it('com aprender ligado, um mindinho que só chega a 0.35 passa a tocar', () => {
      const lo = { ...opts, learn: true };
      expect(fireFrame(4, 0.35, 200, 30, lo)).toBeNull();
      const g = new GestureEngine();
      // 30 s a tocar: o mindinho dobra até 0.35 uma vez por segundo
      for (let k = 0; k < 900; k++) {
        const ph = (k % 30) / 30;
        const b = ph < 0.3 ? Math.sin((ph / 0.3) * Math.PI) : 0;
        g.process(handWith([0, 0.9 * b, 0, 0.45 * b, 0.35 * b]), 1 / 30, lo);
      }
      expect(usableRange(g.adaptive.ranges[4])).toBe(true);
      const ev = record(g);
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo);
      for (let k = 1; k <= 10; k++)
        g.process(handWith([0, 0, 0, 0, 0.35 * smooth(Math.min(1, k / 6))]), 1 / 30, lo);
      expect(ev).toContain('on4');
      // sem `learn` o aprendido não conta
      const g2 = new GestureEngine();
      g2.adaptive.load(g.adaptive.snapshot());
      const ev2 = record(g2);
      for (let k = 0; k < 10; k++) g2.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (let k = 1; k <= 10; k++)
        g2.process(handWith([0, 0, 0, 0, 0.35 * smooth(Math.min(1, k / 6))]), 1 / 30, opts);
      expect(ev2).toEqual([]);
    });

    it('não aprende com mãos pouco confiáveis nem nos primeiros fotogramas', () => {
      const lo = { ...opts, learn: true };
      const g = new GestureEngine();
      for (let k = 0; k < 200; k++)
        g.process(handWith([0, (k % 10) / 10, 0, 0, 0]), 1 / 30, lo, [0.5, 0.99]);
      expect(g.adaptive.samples(1)).toBe(0);
      const g2 = new GestureEngine();
      for (let k = 0; k < 8; k++) g2.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo, [0.95, 0.95]);
      expect(g2.adaptive.samples(1)).toBe(3);
      // a mão desaparece e volta: recomeça a contar
      g2.process([null, null], 1 / 30, lo);
      for (let k = 0; k < 5; k++) g2.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo, [0.95, 0.95]);
      expect(g2.adaptive.samples(1)).toBe(3);
      // polegares nunca aprendem
      expect(g2.adaptive.samples(0)).toBe(0);
    });
  });
});
