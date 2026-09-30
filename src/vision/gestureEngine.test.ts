import { describe, expect, it } from 'vitest';
import { usableRange } from './adaptive';
import { curls, GAP_OPEN, GAP_TOUCH } from './fingerCurl';
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
  THUMB_REST_RELEASE,
  THUMB_SENS_NEUTRAL,
  thresholds,
  thumbThresholds,
  REFRACTORY_S,
  VEL_SMOOTH_PREV,
  velocityFrom,
  type GestureOptions,
} from './gestureEngine';
import { syntheticHand } from './testHands';
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
    /** Polegar esquerdo entre afastado (t = 0) e encostado ao lado do indicador (t = 1). */
    const thumbAt = (t: number): AssignedHands => [
      syntheticHand(false, 0.3, 0.8, { thumb: t }),
      syntheticHand(false, 0.7),
    ];
    /** Mão esquerda com a pressão do polegar `p` (a ponta à distância certa, para o lado). */
    const pressAt = (p: number): AssignedHands => {
      const lm = syntheticHand(false, 0.3);
      const gap = GAP_OPEN - p * (GAP_OPEN - GAP_TOUCH);
      // o segmento 5–6 está em x = 0.27, de y 0.6 a 0.52; a palma mede 0.2
      lm[4] = { x: 0.27 - gap * 0.2, y: 0.56, z: 0 };
      return [lm, syntheticHand(false, 0.7)];
    };

    it('limiares próprios na pressão, deslocados pela sensibilidade dos polegares', () => {
      const t = thumbThresholds(0, THUMB_SENS_NEUTRAL);
      expect(t.on).toBeCloseTo(THUMB_ON);
      expect(t.off).toBeCloseTo(THUMB_ON - THUMB_HYSTERESIS);
      expect(t.early).toBe(t.on);
      expect(thumbThresholds(0, 1).on).toBeLessThan(t.on);
      expect(thumbThresholds(0, 0).on).toBeGreaterThan(t.on);
      expect(thumbThresholds(0, 1).off).toBeGreaterThan(0);
    });

    it('calibrado: vem dos valores do polegar e nunca passa de 85% do caminho', () => {
      const cal = { open: Array(10).fill(0.1), closed: Array(10).fill(0.9) };
      const t = thumbThresholds(0, 0.5, cal);
      // a 60% do caminho entre afastado e encostado, como nos dedos
      expect(t.on).toBeCloseTo(0.1 + 0.8 * 0.6);
      expect(t.off).toBeCloseTo(t.on - THUMB_HYSTERESIS);
      expect(thumbThresholds(0, 0, cal).on).toBeLessThanOrEqual(0.1 + 0.8 * 0.85 + 1e-9);
      const narrow = { open: Array(10).fill(0.2), closed: Array(10).fill(0.5) };
      expect(thumbThresholds(0, 0.5, narrow).off).toBeGreaterThanOrEqual(0.2 + 0.3 * 0.15);
    });

    it('aprendido: segue o intervalo, com limites, e a calibração tem prioridade', () => {
      const def = thumbThresholds(0, 0.5);
      // intervalo 0..1: o mesmo que sem aprendizagem
      expect(thumbThresholds(0, 0.5, null, { lo: 0, hi: 1 }).on).toBeCloseTo(def.on);
      // polegar que repousa perto do indicador: `on` mais alto
      const near = thumbThresholds(0, 0.5, null, { lo: 0.4, hi: 1 });
      expect(near.on).toBeCloseTo(0.4 + 0.6 * THUMB_ON);
      expect(near.off).toBeLessThanOrEqual(near.on - 0.08 + 1e-9);
      expect(near.off).toBeGreaterThan(0.4);
      // intervalo estreito em baixo: a aprendizagem nunca baixa o `on` dos polegares
      expect(thumbThresholds(0, 0.5, null, { lo: 0, hi: 0.4 }).on).toBeCloseTo(def.on);
      expect(thumbThresholds(0, 0.5, null, { lo: 0.1, hi: 0.5 }).on).toBeCloseTo(def.on);
      const cal = { open: Array(10).fill(0.1), closed: Array(10).fill(0.9) };
      expect(thumbThresholds(0, 0.5, cal, { lo: 0.4, hi: 1 })).toEqual(
        thumbThresholds(0, 0.5, cal),
      );
    });

    it('encostar dispara com a confirmação e afastar solta', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 30, topts);
      for (const t of [0.4, 0.8, 1, 1, 1, 1]) g.process(thumbAt(t), 1 / 30, topts);
      expect(ev).toEqual(['on0']);
      expect(g.fingers[0].curl).toBeGreaterThan(0.95);
      // a meio caminho de volta ainda não solta (histerese)
      for (let k = 0; k < 4; k++) g.process(pressAt(0.45), 1 / 30, topts);
      expect(ev).toEqual(['on0']);
      for (let k = 0; k < 4; k++) g.process(thumbAt(0), 1 / 30, topts);
      expect(ev).toEqual(['on0', 'off0']);
    });

    it(`encostado um só fotograma não dispara; ${THUMB_DWELL} seguidos disparam`, () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 50, topts);
      // com a suavização, o 1.º fotograma encostado fica ainda no limiar; o 2.º passa-o
      g.process(thumbAt(1), 1 / 50, topts);
      g.process(thumbAt(1), 1 / 50, topts);
      // o polegar passa o limiar neste fotograma, mas ainda não confirmou
      expect(g.fingers[0].curl).toBeGreaterThan(thumbThresholds(0, 0.5).on);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 50, topts);
      expect(ev).toEqual([]);
      // a pressão ainda não voltou a 0: agora o 1.º fotograma encostado já passa o limiar
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
      let first = 0;
      for (let k = 1; k <= 10; k++) {
        g.process(thumbAt(1), 1 / fps, topts);
        if (!first && g.fingers[0].curl > thumbThresholds(0, 0.5).on) first = k;
        if (ev.length) return k - first + 1;
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
      g.process(thumbAt(1), 1 / 15, topts);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 15, topts);
      expect(ev).toEqual([]);
    });

    it('intensidade: a do primeiro fotograma acima do limiar, maior a encostar depressa', () => {
      const velOf = (frames: number) => {
        const g = new GestureEngine();
        let vel = 0;
        g.on('noteOn', (e) => (vel = e.velocity));
        for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 30, topts);
        for (let k = 1; k <= frames + 4; k++)
          g.process(thumbAt(Math.min(1, k / frames)), 1 / 30, topts);
        return vel;
      };
      const fast = velOf(2);
      const slow = velOf(20);
      expect(fast).toBeGreaterThan(slow);
      expect(slow).toBeGreaterThanOrEqual(0.2);
      expect(fast).toBeLessThanOrEqual(1);
      const g = new GestureEngine();
      let vel = 0;
      g.on('noteOn', (e) => (vel = e.velocity));
      for (let k = 0; k < 3; k++) g.process(thumbAt(0), 1 / 50, topts);
      while (g.fingers[0].curl <= thumbThresholds(0, 0.5).on) g.process(thumbAt(1), 1 / 50, topts);
      const first = velocityFrom(g.fingers[0].vel);
      for (let k = 1; k < THUMB_DWELL; k++) g.process(thumbAt(1), 1 / 50, topts);
      expect(vel).toBeCloseTo(first);
    });

    it('tremor AR(1) a meia distância durante 60 s não toca', () => {
      const rng = (seed: number) => {
        let s = seed >>> 0;
        return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
      };
      const gauss = (r: () => number) =>
        Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
      // repouso a meio caminho entre afastado e o `on`, φ 0.8, σ 0.03–0.05 na pressão
      const rest = THUMB_ON / 2;
      for (const sig of [0.03, 0.04, 0.05])
        for (let seed = 1; seed <= 3; seed++) {
          const r = rng(seed * 101 + 7);
          const g = new GestureEngine();
          const ev = record(g);
          let x = 0;
          for (let k = 0; k < 60 * 30; k++) {
            x = 0.8 * x + gauss(r) * sig;
            g.process(pressAt(rest + x), 1 / 30, topts);
          }
          expect(ev, `σ ${sig}, semente ${seed}`).toEqual([]);
        }
    });

    /**
     * Mão esquerda com o indicador a dobrar (u de 0 a 1, cadeia com ângulos reais) e o polegar
     * parado à frente do segmento 5–6, a meia distância: ao dobrar, o PIP vem ter com o polegar.
     */
    const indexBend = (u: number): AssignedHands => {
      const lm = syntheticHand(false, 0.3);
      const L = [0.08, 0.05, 0.05];
      const ang = [80, 170, 230].map((a) => (a * u * Math.PI) / 180);
      let y = lm[5].y;
      let d = 0;
      for (let k = 0; k < 3; k++) {
        y -= L[k] * Math.cos(ang[k]);
        d -= L[k] * Math.sin(ang[k]);
        lm[6 + k] = { x: lm[5].x, y, z: d / 0.6 };
      }
      lm[4] = { x: lm[5].x - 0.03, y: lm[5].y - 0.04, z: -0.087 / 0.6 };
      return [lm, syntheticHand(false, 0.7)];
    };

    it('o indicador a dobrar até tocar a nota dele não faz tocar o polegar parado', () => {
      expect(curls(indexBend(0)[0]!)[0]).toBeLessThan(0.35);
      expect(curls(indexBend(0.75)[0]!)[0]).toBeGreaterThan(0.9);
      for (const fps of [20, 30, 60])
        for (const ms of [150, 300, 500, 1000]) {
          const g = new GestureEngine();
          const ev = record(g);
          const smooth = (x: number) => x * x * (3 - 2 * x);
          for (let k = 0; k < 20; k++) g.process(indexBend(0), 1 / fps, topts);
          for (let k = 1; k < 2 * fps; k++)
            g.process(indexBend(smooth(Math.min(1, (k * 1000) / fps / ms))), 1 / fps, topts);
          // e volta a esticar
          for (let k = 1; k < fps; k++)
            g.process(indexBend(1 - smooth(Math.min(1, (k * 1000) / fps / ms))), 1 / fps, topts);
          expect(
            ev.filter((e) => e.startsWith('on')),
            `${fps} fps, ${ms} ms`,
          ).toEqual(['on1']);
        }
    });

    it('o polegar a encostar toca, mesmo com o indicador a dobrar ao mesmo tempo', () => {
      for (const withIndex of [false, true]) {
        const g = new GestureEngine();
        const ev = record(g);
        const hand = (t: number): AssignedHands => {
          const lm = indexBend(withIndex ? t : 0)[0]!;
          lm[4] = syntheticHand(false, 0.3, 0.8, { thumb: t })[4];
          return [lm, syntheticHand(false, 0.7)];
        };
        for (let k = 0; k < 10; k++) g.process(hand(0), 1 / 30, topts);
        for (let k = 1; k <= 10; k++) g.process(hand(Math.min(1, k / 5)), 1 / 30, topts);
        expect(
          ev.filter((e) => e === 'on0'),
          `indicador a dobrar: ${withIndex}`,
        ).toEqual(['on0']);
      }
    });

    it('depois de travado pelo indicador, só volta a tocar depois de afastado', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 10; k++) g.process(indexBend(0), 1 / 30, topts);
      for (let k = 1; k <= 30; k++) g.process(indexBend(Math.min(1, k / 6)), 1 / 30, topts);
      expect(ev).toEqual(['on1']);
      // o polegar continua "encostado" (o indicador dobrado ao pé dele): parado não toca
      for (let k = 0; k < 30; k++) g.process(indexBend(1), 1 / 30, topts);
      expect(ev).toEqual(['on1']);
    });

    it('solta ao voltar perto do repouso, mesmo acima do `off`', () => {
      const g = new GestureEngine();
      const ev = record(g);
      const { off } = thumbThresholds(0, 0.5);
      const rest = off - 0.02;
      for (let k = 0; k < 40; k++) g.process(pressAt(rest), 1 / 30, topts);
      for (let k = 0; k < 6; k++) g.process(pressAt(1), 1 / 30, topts);
      expect(ev).toEqual(['on0']);
      // de volta a um pouco acima do repouso (acima do `off`, abaixo do repouso + 0.12): solta
      for (let k = 0; k < 6; k++)
        g.process(pressAt(rest + THUMB_REST_RELEASE - 0.03), 1 / 30, topts);
      expect(ev).toEqual(['on0', 'off0']);
      // repouso baixo: a histerese normal continua (não solta a meio caminho)
      const g2 = new GestureEngine();
      const ev2 = record(g2);
      for (let k = 0; k < 40; k++) g2.process(pressAt(0), 1 / 30, topts);
      for (let k = 0; k < 6; k++) g2.process(pressAt(1), 1 / 30, topts);
      for (let k = 0; k < 6; k++) g2.process(pressAt(0.5), 1 / 30, topts);
      expect(ev2).toEqual(['on0']);
    });

    it('com o indicador dobrado a tocar, o polegar a derivar devagar não toca', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 10; k++) g.process(indexBend(0), 1 / 30, topts);
      for (let k = 1; k <= 30; k++) g.process(indexBend(Math.min(1, k / 6)), 1 / 30, topts);
      // o polegar afasta-se (volta a estar armado) e aproxima-se devagar, com o indicador em baixo
      const hand = (t: number): AssignedHands => {
        const lm = indexBend(1)[0]!;
        const tip = lm[4];
        lm[4] = { x: tip.x - (1 - t) * 0.08, y: tip.y, z: tip.z * t };
        return [lm, syntheticHand(false, 0.7)];
      };
      for (let k = 0; k < 10; k++) g.process(hand(0), 1 / 30, topts);
      for (let k = 0; k <= 120; k++) g.process(hand(k / 120), 1 / 30, topts);
      expect(ev).toEqual(['on1']);
      expect(g.fingers[1].down).toBe(true);
    });

    it('vídeo 16:9: com o tamanho do vídeo nas opções, toca como em quadrado', () => {
      const wide = { ...topts, videoW: 640, videoH: 360 };
      const hand = (t: number): AssignedHands => [
        syntheticHand(false, 0.3, 0.8, { thumb: t, aspect: 640 / 360 }),
        syntheticHand(false, 0.7, 0.8, { aspect: 640 / 360 }),
      ];
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 10; k++) g.process(hand(0), 1 / 30, wide);
      // a meio caminho (pressão ~0.27) não toca; sem a correção pareceria muito mais perto
      for (let k = 0; k < 30; k++) g.process(hand(0.5), 1 / 30, wide);
      expect(ev).toEqual([]);
      for (let k = 0; k < 6; k++) g.process(hand(1), 1 / 30, wide);
      for (let k = 0; k < 6; k++) g.process(hand(0), 1 / 30, wide);
      expect(ev).toEqual(['on0', 'off0']);
      expect(curls(hand(0.5)[0]!)[0]).toBeGreaterThan(curls(hand(0.5)[0]!, 640 / 360)[0] + 0.2);
    });

    it('arrastado pelos outros dedos, o polegar precisa de subir mais', () => {
      /** Pressão do polegar `p`, com o médio dobrado `m` (0..1). */
      const both = (p: number, m: number): AssignedHands => {
        const lm = pressAt(p)[0]!;
        const mid = closeIdx(2)[0]!;
        for (const k of [10, 11, 12])
          lm[k] = {
            x: lm[k].x + (mid[k].x - lm[k].x) * m,
            y: lm[k].y + (mid[k].y - lm[k].y) * m,
            z: lm[k].z + (mid[k].z - lm[k].z) * m,
          };
        return [lm, syntheticHand(false, 0.7)];
      };
      const play = (withMiddle: boolean) => {
        const g = new GestureEngine();
        const ev = record(g);
        for (let k = 0; k < 40; k++) g.process(both(0.3, 0), 1 / 30, topts);
        // o polegar sobe 0.45 (acima de THUMB_MIN_RISE, abaixo de THUMB_MIN_RISE_BUSY)
        for (let k = 1; k <= 8; k++)
          g.process(
            both(0.3 + 0.45 * Math.min(1, k / 4), withMiddle ? Math.min(1, k / 3) : 0),
            1 / 30,
            topts,
          );
        return ev.filter((e) => e === 'on0').length;
      };
      expect(THUMB_MIN_RISE).toBeLessThan(0.45);
      expect(THUMB_MIN_RISE_BUSY).toBeGreaterThan(0.45);
      expect(play(false)).toBe(1);
      expect(play(true)).toBe(0);
    });

    it('a mão a entrar com o polegar encostado não toca até o afastar', () => {
      const g = new GestureEngine();
      const ev = record(g);
      for (let k = 0; k < 30; k++) g.process(thumbAt(1), 1 / 30, topts);
      // a mão sai e volta ainda encostada
      g.process([null, null], 1 / 30, topts);
      for (let k = 0; k < 30; k++) g.process(thumbAt(1), 1 / 30, topts);
      expect(ev).toEqual([]);
      for (let k = 0; k < 5; k++) g.process(thumbAt(0), 1 / 30, topts);
      for (let k = 0; k < 5; k++) g.process(thumbAt(1), 1 / 30, topts);
      expect(ev).toEqual(['on0']);
    });

    it('aprende o intervalo dos polegares (só com os polegares ligados)', () => {
      const lo = { ...topts, learn: true };
      const g = new GestureEngine();
      for (let k = 0; k < 300; k++) g.process(thumbAt(k % 20 < 4 ? 1 : 0.3), 1 / 30, lo);
      expect(g.adaptive.samples(0)).toBeGreaterThan(200);
      expect(g.adaptive.ranges[0]).not.toBeNull();
      const g2 = new GestureEngine();
      for (let k = 0; k < 300; k++)
        g2.process(thumbAt(k % 20 < 4 ? 1 : 0.3), 1 / 30, { ...lo, thumbs: false });
      expect(g2.adaptive.samples(0)).toBe(0);
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
