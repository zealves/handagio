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
  EARLY_MIN_RISES,
  ENTRY_IGNORE_FRAMES,
  EARLY_VEL,
  FINGER_ON_DISCOUNT,
  GestureEngine,
  HYSTERESIS,
  JITTER_K,
  LEARN_MAX_DROP,
  LEARN_SKIP_AFTER_SWAP,
  LEARN_OFF_FRAC,
  LEARN_ON_FRAC,
  learnedThresholds,
  heightShiftOf,
  onThreshold,
  THUMB_DWELL,
  THUMB_DWELL_MIN,
  THUMB_HYSTERESIS,
  THUMB_ON,
  THUMB_MIN_RISE,
  THUMB_MIN_RISE_BUSY,
  THUMB_SENS_NEUTRAL,
  thresholds,
  thumbThresholds,
  REFRACTORY_S,
  VEL_SMOOTH_PREV,
  velocityFrom,
  type GestureOptions,
} from './gestureEngine';
import { syntheticHand } from './testHands';
import { PALM_WIDTH_RATIO } from './thumbMotion';
import type { AssignedHands } from './types';

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
    for (let k = 0; k < 5; k++) g.process(open, 1 / 30, opts);
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
    /** Largura da palma sintética (0.09) a dividir pelo comprimento (0.2), numa palma real. */
    const SYN_WIDTH = 0.09 / 0.2 / PALM_WIDTH_RATIO;
    /**
     * Mão esquerda com a ponta do polegar deslocada (dx, dy) palmas do sítio de repouso, em
     * coordenadas da mão em pé (dx para o lado do mindinho, na escala de uma palma real; dy para
     * o pulso), com a rotação e a inclinação de `pose` (ver `syntheticHand`).
     */
    const thumbOff = (
      dx0 = 0,
      dy0 = 0,
      pose: { rot?: number; tilt?: number; aspect?: number; scale?: number } = {},
      closed: boolean[] | boolean = false,
    ) => {
      const lm = syntheticHand(closed, 0.3, 0.8, pose);
      const palm = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
      const r = ((pose.rot ?? 0) * Math.PI) / 180;
      const y = dy0 * Math.cos(((pose.tilt ?? 0) * Math.PI) / 180);
      const dx = dx0 * SYN_WIDTH;
      const x = (dx * Math.cos(r) - y * Math.sin(r)) / (pose.aspect ?? 1);
      lm[4] = {
        ...lm[4],
        x: lm[4].x + x * palm,
        y: lm[4].y + (dx * Math.sin(r) + y * Math.cos(r)) * palm,
      };
      return [lm, syntheticHand(false, 0.7)] as AssignedHands;
    };
    /** Polegar parado `rest` fotogramas e depois um toque rápido até (dx, dy), seguro `hold`. */
    const flick = (
      g: GestureEngine,
      dx: number,
      dy: number,
      pose: object = {},
      hold = 10,
      o = topts,
      aspect?: number,
    ) => {
      const oo = aspect ? { ...o, aspect } : o;
      for (let k = 0; k < 20; k++) g.process(thumbOff(0, 0, pose), 1 / 30, oo);
      for (const f of [0.5, 1]) g.process(thumbOff(dx * f, dy * f, pose), 1 / 30, oo);
      for (let k = 0; k < hold; k++) g.process(thumbOff(dx, dy, pose), 1 / 30, oo);
    };

    it('limiares próprios, só com a sensibilidade dos polegares', () => {
      const t = thumbThresholds(THUMB_SENS_NEUTRAL);
      expect(t.on).toBeCloseTo(THUMB_ON);
      expect(t.off).toBeCloseTo(THUMB_ON - THUMB_HYSTERESIS);
      expect(t.early).toBe(t.on);
      expect(thumbThresholds(1).on).toBeLessThan(t.on);
      expect(thumbThresholds(0).on).toBeGreaterThan(t.on);
      expect(thumbThresholds(1).off).toBeGreaterThan(0);
    });

    it('toca ao dobrar e ao mover para baixo, com a mão direita, rodada ou inclinada', () => {
      const poses: [object, number?][] = [
        [{}],
        [{ rot: 40 }],
        [{ rot: -45 }],
        [{ tilt: 55 }],
        [{ rot: 30, tilt: 45 }],
        [{ scale: 0.6 }],
        [{ aspect: 16 / 9 }, 16 / 9],
      ];
      for (const [pose, aspect] of poses)
        for (const [dx, dy] of [
          [0.4, 0],
          [0, 0.4],
          [0.3, 0.3],
        ]) {
          const g = new GestureEngine();
          const ev = record(g);
          flick(g, dx, dy, pose, 10, topts, aspect);
          expect(
            ev.filter((e) => e.startsWith('on')),
            `${JSON.stringify(pose)} ${dx},${dy}`,
          ).toEqual(['on0']);
        }
    });

    it('para cima, para fora e nas diagonais para cima não toca, em qualquer pose', () => {
      for (const pose of [{}, { rot: 40 }, { rot: -45 }, { tilt: 55 }, { rot: 30, tilt: 45 }])
        for (const [dx, dy] of [
          [0, -0.45],
          [-0.45, 0],
          [-0.35, -0.35],
          [0.35, -0.35],
          [-0.35, 0.35],
        ]) {
          const g = new GestureEngine();
          const ev = record(g);
          flick(g, dx, dy, pose, 10);
          for (let k = 0; k < 20; k++) g.process(thumbOff(0, 0, pose), 1 / 30, topts);
          expect(ev, `${JSON.stringify(pose)} ${dx},${dy}`).toEqual([]);
        }
    });

    it('a mão inteira a mexer, rodar e inclinar, com o polegar quieto, não toca', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 20; k++) g.process(thumbOff(), 1 / 30, topts);
      for (let k = 0; k < 60; k++) {
        const lm = syntheticHand(false, 0.3 + 0.002 * k, 0.8 - 0.002 * k, {
          rot: Math.sin(k / 6) * 35,
          tilt: Math.abs(Math.sin(k / 9)) * 50,
        });
        g.process([lm, syntheticHand(false, 0.7)], 1 / 30, topts);
      }
      expect(ev).toEqual([]);
    });

    it('é um toque: solta sozinho se o polegar parar, e voltar ao sítio não toca de novo', () => {
      const g = new GestureEngine();
      const ev = record(g);
      flick(g, 0.35, 0, {}, 30);
      expect(ev).toEqual(['on0', 'off0']);
      for (let k = 0; k < 30; k++) g.process(thumbOff(0, 0), 1 / 30, topts);
      expect(ev).toEqual(['on0', 'off0']);
      // um toque de ida e volta rápido toca uma vez e solta no regresso
      const g2 = new GestureEngine();
      const ev2 = record(g2);
      flick(g2, 0, 0.35, {}, 2);
      for (let k = 0; k < 20; k++) g2.process(thumbOff(0, 0), 1 / 30, topts);
      expect(ev2).toEqual(['on0', 'off0']);
    });

    it('a nota dura pouco mais do que o movimento (≤ 0,8 s parado)', () => {
      const g = new GestureEngine();
      let downFrames = 0;
      flick(g, 0.35, 0, {}, 0);
      for (let k = 0; k < 60; k++) {
        g.process(thumbOff(0.35, 0), 1 / 30, topts);
        if (g.fingers[0].down) downFrames++;
      }
      expect(downFrames).toBeGreaterThan(2);
      expect(downFrames).toBeLessThanOrEqual(24);
    });

    it('os outros dedos a dobrar, com o polegar quieto, não o fazem tocar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 20; k++) g.process(thumbOff(), 1 / 30, topts);
      for (const q of [1, 2, 3, 4]) {
        const c = [false, false, false, false, false];
        c[q] = true;
        for (let k = 0; k < 8; k++) g.process(thumbOff(0, 0, {}, c), 1 / 30, topts);
        for (let k = 0; k < 8; k++) g.process(thumbOff(), 1 / 30, topts);
      }
      expect(ev.filter((e) => e === 'on0')).toEqual([]);
      expect(ev.filter((e) => e.startsWith('on'))).toEqual(['on1', 'on2', 'on3', 'on4']);
    });

    it('com outro dedo da mesma mão em baixo, o polegar precisa de se mexer mais', () => {
      // para baixo, no eixo do médio (v): 1 palma = 1 unidade
      const small = 0.22;
      const g = new GestureEngine();
      const ev = record(g);
      flick(g, 0, small);
      expect(
        ev.filter((e) => e === 'on0'),
        'sozinho',
      ).toEqual(['on0']);
      // o médio em baixo: o mesmo movimento não chega; um maior sim
      const mid = [false, false, true, false, false];
      for (const [d, want] of [
        [small, []],
        [0.4, ['on0']],
      ] as const) {
        const g2 = new GestureEngine();
        const ev2 = record(g2);
        for (let k = 0; k < 10; k++) g2.process(thumbOff(), 1 / 30, topts);
        for (let k = 0; k < 20; k++) g2.process(thumbOff(0, 0, {}, mid), 1 / 30, topts);
        for (const f of [0.5, 1]) g2.process(thumbOff(0, d * f, {}, mid), 1 / 30, topts);
        for (let k = 0; k < 10; k++) g2.process(thumbOff(0, d, {}, mid), 1 / 30, topts);
        expect(
          ev2.filter((e) => e === 'on0'),
          `${d}`,
        ).toEqual(want);
      }
      expect(THUMB_MIN_RISE_BUSY).toBeGreaterThan(THUMB_MIN_RISE);
    });

    it('um salto de um fotograma não toca (confirmação THUMB_DWELL_MIN)', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 20; k++) g.process(thumbOff(), 1 / 30, topts);
      g.process(thumbOff(0.4, 0), 1 / 30, topts);
      for (let k = 0; k < 20; k++) g.process(thumbOff(), 1 / 30, topts);
      expect(ev).toEqual([]);
      expect(THUMB_DWELL).toBeGreaterThanOrEqual(THUMB_DWELL_MIN);
    });

    it('a mão a entrar com o polegar já afastado não toca', () => {
      const g = new GestureEngine();
      const ev = record(g);
      g.process([null, null], 1 / 30, topts);
      for (let k = 0; k < 20; k++) g.process(thumbOff(0.4, 0), 1 / 30, topts);
      expect(ev).toEqual([]);
    });

    it('com a mão de lado (palma em fio) não há medida e não toca', () => {
      const g = new GestureEngine();
      const ev = record(g);
      flick(g, 0.4, 0, { tilt: 89 });
      expect(ev).toEqual([]);
    });

    it('os polegares não aprendem nem usam a calibração', () => {
      const lo = { ...topts, learn: true };
      const g = new GestureEngine();
      for (let k = 0; k < 300; k++) g.process(thumbOff(k % 20 < 4 ? 0.35 : 0, 0), 1 / 30, lo);
      expect(g.adaptive.samples(0)).toBe(0);
      // uma calibração antiga com o polegar "encostado" não muda o limiar
      const cal = { open: Array(10).fill(0.1), closed: Array(10).fill(0.9) };
      const g2 = new GestureEngine();
      const ev2 = record(g2);
      flick(g2, 0.35, 0, {}, 10, { ...topts, calibration: cal });
      expect(ev2.filter((e) => e === 'on0')).toEqual(['on0']);
    });

    it('os outros dedos disparam logo no primeiro fotograma acima do limiar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 5; k++) g.process(open, 1 / 30, topts);
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

  describe('deteção afinada (v2.2)', () => {
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
        // o off não desce com o desconto (o da v2.1): a nota não fica presa
        expect(t.off).toBeCloseTo(base - HYSTERESIS);
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

    it(`disparo antecipado: ${EARLY_MIN_RISES} fotogramas a subir, antes de passar o on`, () => {
      // dobra rápida (150 ms): toca ao 3.º fotograma, como a v2.1 (o antecipado não ganha aqui)
      expect(fireFrame(1, 0.9, 150, 30)).toBe(3);
      expect(fireFrame(1, 0.9, 150, 20)).toBe(3);
      // dobra média (300 ms): a v2.1 tocava ao 6.º (30 fps) e ao 4.º (20 fps)
      expect(fireFrame(1, 0.9, 300, 30)).toBe(5);
      expect(fireFrame(1, 0.9, 300, 20)).toBe(3);
      // no fotograma do disparo a dobra suavizada ainda não chegou ao limiar
      const g = new GestureEngine();
      let at = -1;
      g.on('noteOn', () => (at = g.fingers[1].curl));
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (let k = 1; k <= 10 && at < 0; k++)
        g.process(handWith([0, 0.9 * smooth(Math.min(1, k / 9)), 0, 0, 0]), 1 / 30, opts);
      expect(g.lastTrigger[1]).toBe('early');
      expect(at).toBeLessThan(thresholds(1, 0.55).on);
    });

    it('salto de 2 fotogramas da deteção até 0.55 não toca (como na v2.1)', () => {
      for (const j of [1, 4]) {
        const g = new GestureEngine();
        const ev = record(g);
        const at = (v: number) => {
          const c = [0, 0.15, 0.1, 0.1, 0.1];
          c[j] = v;
          g.process(handWith(c), 1 / 30, opts);
        };
        for (let k = 0; k < 30; k++) at(0.15);
        for (const v of [0.35, 0.55, 0.15, 0.15, 0.15]) at(v);
        expect(ev).toEqual([]);
      }
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

    /** PRNG determinista e ruído gaussiano (o modelo da revisão). */
    const rng = (seed: number) => {
      let x = seed >>> 0;
      return () => (x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    };
    const gauss = (r: () => number) =>
      Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

    it('mindinho relaxado meio dobrado (0.30) solta a nota', () => {
      for (const rest of [0.28, 0.3, 0.32]) {
        const g = new GestureEngine();
        const ev = record(g);
        const r = rng(3);
        const at = (v: number) => g.process(handWith([0, 0.1, 0.1, 0.1, v]), 1 / 30, opts);
        for (let k = 0; k < 30; k++) at(rest);
        for (let k = 0; k < 8; k++) at(0.1 + (0.8 - 0.1) * (k / 7));
        for (let k = 0; k < 8; k++) at(0.8 - (0.8 - rest) * (k / 7));
        for (let k = 0; k < 60; k++) at(rest + gauss(r) * 0.01);
        expect(ev).toEqual(['on4', 'off4']);
        expect(g.fingers[4].down).toBe(false);
      }
    });

    it('tremor correlacionado AR(1) em repouso: nenhuma nota em 60 s', { timeout: 60_000 }, () => {
      // [repouso, σ, φ, sementes]: os cenários da revisão em que a v2.1 dá 0 notas (com
      // 0.25 ± 0.05 e φ 0.8 a v2.1 também toca sozinha nalgumas sementes; a 7 é a da revisão)
      const scenarios: [number, number, number, number[]][] = [
        [0.15, 0.03, 0.8, [1, 2, 3]],
        [0.15, 0.04, 0.8, [1, 2, 3]],
        [0.15, 0.05, 0.8, [1, 2, 3]],
        [0.2, 0.04, 0.8, [1, 2, 3]],
        [0.2, 0.05, 0.7, [1, 2, 3]],
        [0.25, 0.04, 0.8, [1, 2, 3]],
        [0.25, 0.05, 0.8, [7]],
      ];
      for (const [rest, sig, phi, seeds] of scenarios) {
        for (const seed of seeds) {
          const r = rng(seed);
          const g = new GestureEngine();
          const ev = record(g);
          const x = [0, 0, 0, 0, 0];
          for (let k = 0; k < 60 * 30; k++) {
            const c = [0];
            for (let j = 1; j < 5; j++) {
              x[j] = phi * x[j] + gauss(r) * sig;
              c.push(Math.max(0, Math.min(1, rest + x[j])));
            }
            g.process(handWith(c), 1 / 30, opts);
          }
          expect(ev, `repouso ${rest} σ ${sig} φ ${phi} semente ${seed}`).toEqual([]);
        }
      }
    });

    it('salto de 2 fotogramas da deteção (oclusão) não toca', () => {
      for (const a of [0.08, 0.1, 0.12, 0.15]) {
        const g = new GestureEngine();
        const ev = record(g);
        for (let k = 0; k < 30; k++) g.process(handWith([0, 0.15, 0.1, 0.1, 0.1]), 1 / 30, opts);
        for (const v of [0.15 + a, 0.15 + 2 * a, 0.15, 0.15])
          g.process(handWith([0, v, 0.1, 0.1, 0.1]), 1 / 30, opts);
        expect(ev).toEqual([]);
      }
    });

    it('regras de disparo: a da v2.1 na dobra forte, as novas no mindinho fraco', () => {
      const g = new GestureEngine();
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (const v of [0.114, 0.375, 0.667]) g.process(handWith([0, v, 0, 0, 0]), 1 / 30, opts);
      expect(g.fingers[1].down).toBe(true);
      expect(g.lastTrigger[1]).toBe('full');
      const g2 = new GestureEngine();
      for (let k = 0; k < 10; k++) g2.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (let k = 1; k <= 8 && !g2.fingers[4].down; k++)
        g2.process(handWith([0, 0, 0, 0, 0.45 * smooth(Math.min(1, k / 6))]), 1 / 30, opts);
      expect(g2.fingers[4].down).toBe(true);
      expect(g2.lastTrigger[4]).not.toBe('full');
    });

    it('mindinho fraco a partir de um repouso meio dobrado (0.10, 0.15) toca', () => {
      for (const rest of [0.1, 0.15]) {
        const g = new GestureEngine();
        const ev = record(g);
        const at = (v: number) => g.process(handWith([0, rest, rest, rest, v]), 1 / 30, opts);
        for (let k = 0; k < 30; k++) at(rest);
        for (let r = 0; r < 10; r++) {
          for (let k = 1; k <= 6; k++) at(rest + (0.45 - rest) * smooth(Math.min(1, k / 5)));
          for (let k = 1; k <= 5; k++) at(0.45 - (0.45 - rest) * smooth(Math.min(1, k / 4)));
          for (let k = 0; k < 15; k++) at(rest);
        }
        expect(ev.filter((e) => e === 'on4').length, `repouso ${rest}`).toBeGreaterThanOrEqual(9);
      }
    });

    it('frase no anelar com o mindinho arrastado a 40%: a dobra fraca do mindinho toca', () => {
      for (const pause of [3, 9, 18]) {
        const g = new GestureEngine();
        const ev = record(g);
        const at = (ring: number, p: number) =>
          g.process(handWith([0, 0, 0, ring, p]), 1 / 30, opts);
        for (let k = 0; k < 30; k++) at(0, 0);
        for (let n = 0; n < 3; n++)
          for (let k = 1; k <= 18; k++) {
            const t =
              k <= 6
                ? smooth(Math.min(1, k / 5))
                : k <= 9
                  ? 1
                  : 1 - smooth(Math.min(1, (k - 9) / 5));
            at(0.8 * t, 0.32 * t);
          }
        expect(ev.filter((e) => e === 'on4')).toEqual([]);
        for (let k = 0; k < pause; k++) at(0, 0);
        for (let k = 1; k <= 12; k++) at(0, 0.45 * smooth(Math.min(1, k / 5)));
        expect(
          ev.filter((e) => e === 'on4'),
          `pausa ${pause}`,
        ).toHaveLength(1);
      }
    });

    it('mindinho arrastado pelo anelar (40%, 1–2 fotogramas atrás, repouso 0.10) não toca', () => {
      for (const lag of [0, 1, 2]) {
        const r = rng(17 + lag);
        const g = new GestureEngine();
        const ev = record(g);
        const hist: number[] = [];
        const at = (ring: number) => {
          hist.push(ring);
          const lagged = hist[Math.max(0, hist.length - 1 - lag)];
          const n = () => gauss(r) * 0.01;
          g.process(
            handWith([0, 0.1 + n(), 0.1 + n(), ring + n(), 0.1 + 0.4 * lagged + n()]),
            1 / 30,
            opts,
          );
        };
        for (let k = 0; k < 45; k++) at(0);
        for (let q = 0; q < 20; q++) {
          for (let k = 1; k <= 5; k++) at(0.8 * smooth(k / 5));
          for (let k = 0; k < 8; k++) at(0.8);
          for (let k = 1; k <= 5; k++) at(0.8 * (1 - smooth(k / 5)));
          for (let k = 0; k < 10; k++) at(0);
        }
        expect(
          ev.filter((e) => e === 'on3'),
          `atraso ${lag}`,
        ).toHaveLength(20);
        expect(
          ev.filter((e) => e === 'on4'),
          `atraso ${lag}`,
        ).toEqual([]);
      }
    });

    it('com limiares aprendidos, a postura a subir aos poucos não toca abaixo do on da v2.1', () => {
      const lo = { ...opts, learn: true };
      for (const j of [3, 4]) {
        const g = new GestureEngine();
        const ranges: ({ lo: number; hi: number } | null)[] = new Array(10).fill(null);
        ranges[j] = { lo: 0.1, hi: 0.68 };
        g.adaptive.load(ranges);
        const ev = record(g);
        const r = rng(3 + j);
        const at = (v: number) => {
          const c = [0, 0.1, 0.1, 0.1, 0.1].map((x) => x + gauss(r) * 0.008);
          c[j] = v + gauss(r) * 0.008;
          g.process(handWith(c), 1 / 30, lo);
        };
        for (let k = 0; k < 45; k++) at(0.1);
        // degraus de 0.05 em 3 fotogramas, 1.2 s cada, até 0.45 (abaixo do on da v2.1)
        for (let v = 0.1; v < 0.45 - 1e-9; v += 0.05) {
          for (let k = 1; k <= 3; k++) at(v + 0.05 * smooth(k / 3));
          for (let k = 0; k < 36; k++) at(v + 0.05);
        }
        expect(ev, `dedo ${j}`).toEqual([]);
      }
    });

    it(`nos primeiros ${ENTRY_IGNORE_FRAMES} fotogramas de uma mão nada toca`, () => {
      const g = new GestureEngine();
      const ev = record(g);
      // entra esticada e dobra logo: só pode tocar depois de ENTRY_IGNORE_FRAMES fotogramas
      g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, opts);
      for (let k = 2; k <= ENTRY_IGNORE_FRAMES; k++)
        g.process(handWith([0, 0.9, 0, 0, 0]), 1 / 30, opts);
      expect(ev).toEqual([]);
    });

    it('tentativas falhadas e ruído forte não prendem o tremor em cima', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const r = rng(5);
      // 60 s de deteção muito tremida, depois 20 tentativas que não chegam a tocar (até 0.3)
      for (let k = 0; k < 1800; k++) {
        const n = () => 0.15 + gauss(r) * 0.2;
        g.process(handWith([0, n(), n(), n(), n()]), 1 / 30, opts);
      }
      for (let q = 0; q < 20; q++)
        for (let k = 1; k <= 15; k++)
          g.process(
            handWith([0, 0.1, 0.1, 0.1, 0.1 + 0.2 * Math.sin((Math.PI * k) / 15)]),
            1 / 30,
            opts,
          );
      ev.length = 0;
      // limpo outra vez: a dobra fraca do mindinho volta a tocar em poucos segundos
      let hits = 0;
      for (let q = 0; q < 4; q++) {
        for (let k = 0; k < 30; k++) g.process(handWith([0, 0.1, 0.1, 0.1, 0.1]), 1 / 30, opts);
        const b = ev.length;
        for (let k = 1; k <= 12; k++)
          g.process(
            handWith([0, 0.1, 0.1, 0.1, 0.1 + 0.35 * smooth(Math.min(1, k / 6))]),
            1 / 30,
            opts,
          );
        for (let k = 0; k < 8; k++) g.process(handWith([0, 0.1, 0.1, 0.1, 0.1]), 1 / 30, opts);
        if (ev.slice(b).includes('on4')) hits++;
      }
      expect(hits).toBeGreaterThanOrEqual(3);
    });

    it('dobras fracas repetidas do mindinho tocam todas (o tremor não sobe com o tocar)', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const at = (v: number) => g.process(handWith([0, 0, 0, 0, v]), 1 / 30, opts);
      for (let k = 0; k < 15; k++) at(0);
      for (let r = 0; r < 10; r++) {
        for (let k = 1; k <= 6; k++) at(0.45 * smooth(k / 6));
        for (let k = 1; k <= 5; k++) at(0.45 * (1 - smooth(k / 5)));
        for (let k = 0; k < 3; k++) at(0);
      }
      expect(ev.filter((e) => e === 'on4')).toHaveLength(10);
    });

    it(`deteção muito tremida: o desconto e o antecipado pedem ${JITTER_K}× o tremor`, () => {
      const g = new GestureEngine();
      const ev = record(g);
      const r = rng(9);
      // 20 s com o mindinho a tremer muito (σ ≈ 0.08)
      let x = 0;
      for (let k = 0; k < 600; k++) {
        x = 0.8 * x + gauss(r) * 0.05;
        g.process(handWith([0, 0.1, 0.1, 0.1, Math.max(0, 0.2 + x)]), 1 / 30, opts);
      }
      ev.length = 0;
      // a dobra fraca (até 0.45) já não chega: seria igual ao tremor; a da v2.1 continua a tocar
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0.1, 0.1, 0.1, 0.05]), 1 / 30, opts);
      for (let k = 1; k <= 8; k++)
        g.process(
          handWith([0, 0.1, 0.1, 0.1, 0.05 + 0.4 * smooth(Math.min(1, k / 6))]),
          1 / 30,
          opts,
        );
      expect(ev).toEqual([]);
      for (let k = 1; k <= 8; k++)
        g.process(
          handWith([0, 0.1, 0.1, 0.1, 0.45 + 0.4 * smooth(Math.min(1, k / 4))]),
          1 / 30,
          opts,
        );
      expect(ev).toEqual(['on4']);
      expect(g.lastTrigger[4]).toBe('full');
    });

    it('mão que reaparece com dedos dobrados não toca até os esticar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const r = rng(5);
      for (let k = 0; k < 30; k++) g.process(handWith([0, 0.1, 0.1, 0.1, 0.1]), 1 / 30, opts);
      for (let k = 0; k < 10; k++) g.process([null, RIGHT], 1 / 30, opts);
      for (let k = 0; k < 60; k++)
        g.process(
          handWith([0, 0.8 + gauss(r) * 0.02, 0.1, 0.1, 0.6 + gauss(r) * 0.02]),
          1 / 30,
          opts,
        );
      expect(ev).toEqual([]);
      // esticado e dobrado outra vez: toca
      for (let k = 0; k < 3; k++) g.process(handWith([0, 0.05, 0.1, 0.1, 0.1]), 1 / 30, opts);
      for (let k = 0; k < 4; k++) g.process(handWith([0, 0.9, 0.1, 0.1, 0.1]), 1 / 30, opts);
      expect(ev).toEqual(['on1']);
    });

    it('troca de lado: solta as notas desse lado e não toca o dedo que já vinha dobrado', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0.1, 0.1, 0.1, 0.1]), 1 / 30, opts);
      for (let k = 0; k < 4; k++) g.process(handWith([0, 0.1, 0.9, 0.1, 0.1]), 1 / 30, opts);
      expect(ev).toEqual(['on2']);
      // a outra mão passa para este lado com o indicador dobrado
      g.process(handWith([0, 0.8, 0.1, 0.1, 0.1]), 1 / 30, opts, [], [true, false]);
      for (let k = 0; k < 20; k++) g.process(handWith([0, 0.8, 0.1, 0.1, 0.1]), 1 / 30, opts);
      expect(ev).toEqual(['on2', 'off2']);
      // sem a troca, o mesmo salto seria uma dobra muito rápida e tocava
      const g2 = new GestureEngine();
      const ev2 = record(g2);
      for (let k = 0; k < 10; k++) g2.process(handWith([0, 0.1, 0.1, 0.1, 0.1]), 1 / 30, opts);
      g2.process(handWith([0, 0.8, 0.1, 0.1, 0.1]), 1 / 30, opts);
      g2.process(handWith([0, 0.8, 0.1, 0.1, 0.1]), 1 / 30, opts);
      expect(ev2).toEqual(['on1']);
    });

    it(`depois de trocar de lado a aprendizagem espera ${LEARN_SKIP_AFTER_SWAP} fotogramas`, () => {
      const lo = { ...opts, learn: true };
      const g = new GestureEngine();
      for (let k = 0; k < 10; k++) g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo);
      const n = g.adaptive.samples(1);
      g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo, [], [true, false]);
      for (let k = 0; k < LEARN_SKIP_AFTER_SWAP - 1; k++)
        g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo);
      expect(g.adaptive.samples(1)).toBe(n);
      g.process(handWith([0, 0, 0, 0, 0]), 1 / 30, lo);
      expect(g.adaptive.samples(1)).toBe(n + 1);
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
      // polegares desligados não aprendem
      expect(g2.adaptive.samples(0)).toBe(0);
    });
  });
});
