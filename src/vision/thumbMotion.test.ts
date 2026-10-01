import { describe, expect, it } from 'vitest';
import { syntheticHand } from './testHands';
import { PALM_WIDTH_RATIO, palmCoords, ThumbMotion, THUMB_MOVE_FULL } from './thumbMotion';
import type { Pt } from './types';

/** Mão esquerda com a ponta do polegar deslocada (dx, dy) em palmas, em coordenadas da imagem. */
function withThumb(pose: object, dx = 0, dy = 0): Pt[] {
  const lm = syntheticHand(false, 0.4, 0.7, pose);
  const palm = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
  lm[4] = { ...lm[4], x: lm[4].x + dx * palm, y: lm[4].y + dy * palm };
  return lm;
}

/**
 * Mão esquerda com a ponta do polegar deslocada (dx, dy) palmas em coordenadas da mão em pé (x
 * para o lado do mindinho, y para o pulso), com a mesma rotação e inclinação da mão.
 */
function handOff(pose: { rot?: number; tilt?: number; aspect?: number } = {}, dx0 = 0, dy = 0) {
  // a palma sintética é mais estreita do que uma real: o lado passa para a escala de uma palma real
  const dx = dx0 * SYN_WIDTH;
  const t = ((pose.tilt ?? 0) * Math.PI) / 180;
  const r = ((pose.rot ?? 0) * Math.PI) / 180;
  const y = dy * Math.cos(t);
  const x = (dx * Math.cos(r) - y * Math.sin(r)) / (pose.aspect ?? 1);
  return withThumb(pose, x, dx * Math.sin(r) + y * Math.cos(r));
}

/** Largura da palma sintética (5 → 17: 0.09) a dividir pelo comprimento (0 → 9: 0.2), numa real. */
const SYN_WIDTH = 0.09 / 0.2 / PALM_WIDTH_RATIO;

/** Dobrar (para dentro da palma), para baixo (para o pulso) e na diagonal entre os dois. */
const DOWN = [
  [0.4, 0],
  [0, 0.4],
  [0.3, 0.3],
];
/** Para cima (para os dedos), para fora e as diagonais para cima. */
const UP = [
  [0, -0.4],
  [-0.4, 0],
  [-0.3, -0.3],
  [0.3, -0.3],
  [-0.3, 0.3],
];

const POSES = [
  {},
  { rot: 35 },
  { rot: -50 },
  { tilt: 55 },
  { rot: 25, tilt: 50 },
  { scale: 0.6 },
  { aspect: 16 / 9 },
];

describe('palmCoords', () => {
  it('não muda ao mover, rodar, escalar ou inclinar a mão', () => {
    const ref = palmCoords(withThumb({}))!;
    for (const pose of POSES.slice(1)) {
      const aspect = (pose as { aspect?: number }).aspect ?? 1;
      const c = palmCoords(withThumb(pose), aspect)!;
      expect(c.u, JSON.stringify(pose)).toBeCloseTo(ref.u, 1);
      expect(c.v, JSON.stringify(pose)).toBeCloseTo(ref.v, 1);
    }
  });
  it('mão de lado (palma em fio): sem medida', () => {
    expect(palmCoords(withThumb({ tilt: 89 }))).toBeNull();
  });
});

describe('ThumbMotion', () => {
  const run = (m: ThumbMotion, lm: Pt[], frames: number, aspect = 1) => {
    let p = 0;
    for (let k = 0; k < frames; k++) p = m.update(lm, aspect, 1 / 30);
    return p;
  };

  it('parado não pressiona; dobrar (para dentro) e para baixo sim, em qualquer pose', () => {
    for (const pose of POSES) {
      const aspect = (pose as { aspect?: number }).aspect ?? 1;
      for (const [dx, dy] of DOWN) {
        const m = new ThumbMotion();
        expect(run(m, handOff(pose), 20, aspect)).toBe(0);
        const p = run(m, handOff(pose, dx, dy), 3, aspect);
        expect(p, `${JSON.stringify(pose)} ${dx},${dy}`).toBeGreaterThan(0.65);
      }
    }
  });

  it('para cima, para fora ou na diagonal para cima não pressiona', () => {
    for (const pose of POSES) {
      const aspect = (pose as { aspect?: number }).aspect ?? 1;
      for (const [dx, dy] of UP) {
        const m = new ThumbMotion();
        run(m, handOff(pose), 20, aspect);
        let max = 0;
        for (let k = 0; k < 6; k++)
          max = Math.max(
            max,
            m.update(
              handOff(pose, dx * Math.min(1, (k + 1) / 2), dy * Math.min(1, (k + 1) / 2)),
              aspect,
              1 / 30,
            ),
          );
        expect(max, `${JSON.stringify(pose)} ${dx},${dy}`).toBeLessThan(0.2);
      }
    }
  });

  it('a mão inteira a mexer e a rodar, com o polegar quieto, não pressiona', () => {
    const m = new ThumbMotion();
    run(m, withThumb({}), 10);
    let max = 0;
    for (let k = 0; k < 30; k++) {
      const lm = syntheticHand(false, 0.4 + k * 0.01, 0.7 - k * 0.005, { rot: k * 2, tilt: k });
      max = Math.max(max, m.update(lm, 1, 1 / 30));
    }
    expect(max).toBeLessThan(0.2);
  });

  it('o repouso apanha o polegar parado: a pressão desce sozinha', () => {
    const m = new ThumbMotion();
    run(m, withThumb({}), 10);
    expect(run(m, withThumb({}, 0.3), 3)).toBeGreaterThan(0.65);
    // em 1 s fica abaixo do `off` dos polegares (0.40)
    expect(run(m, withThumb({}, 0.3), 30)).toBeLessThan(0.35);
  });

  it('depois de soltar, voltar ao sítio de partida não conta como movimento novo', () => {
    const m = new ThumbMotion();
    run(m, withThumb({}), 10);
    m.markStart();
    run(m, withThumb({}, 0.3), 20);
    m.release();
    expect(run(m, withThumb({}), 3)).toBeLessThan(0.2);
  });

  it('a pressão chega a 1 com um movimento de THUMB_MOVE_FULL', () => {
    const m = new ThumbMotion();
    run(m, withThumb({}), 10);
    // para baixo, no eixo do médio (v), 1 palma = 1 unidade
    expect(m.update(withThumb({}, 0, THUMB_MOVE_FULL * 1.05), 1, 1 / 30)).toBeCloseTo(1, 1);
  });
});
