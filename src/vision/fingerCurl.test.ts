import { describe, expect, it } from 'vitest';
import { angleAt, curls, GAP_OPEN, GAP_TOUCH, thumbGap, thumbPress } from './fingerCurl';
import { syntheticHand } from './testHands';

describe('fingerCurl', () => {
  it('ângulo reto e raso', () => {
    const a = { x: 0, y: 0, z: 0 };
    expect(angleAt({ x: 1, y: 0, z: 0 }, a, { x: -1, y: 0, z: 0 })).toBeCloseTo(180);
    expect(angleAt({ x: 1, y: 0, z: 0 }, a, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
  });

  it('mão aberta dá dobras perto de 0', () => {
    const c = curls(syntheticHand(false));
    expect(c).toHaveLength(5);
    c.slice(1).forEach((v) => expect(v).toBeLessThan(0.15));
    expect(c[0]).toBeLessThan(0.3);
  });

  it('mão fechada dá dobras altas', () => {
    const c = curls(syntheticHand(true));
    c.slice(1).forEach((v) => expect(v).toBeGreaterThan(0.7));
    expect(c[0]).toBeGreaterThan(0.5);
  });

  it('só o dedo dobrado sobe', () => {
    const c = curls(syntheticHand([false, false, true, false, false]));
    expect(c[2]).toBeGreaterThan(0.7);
    expect(c[1]).toBeLessThan(0.15);
    expect(c[3]).toBeLessThan(0.15);
  });

  it('valores sempre entre 0 e 1', () => {
    for (const v of [...curls(syntheticHand(true)), ...curls(syntheticHand(false))]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  describe('polegar: encostar ao lado do indicador', () => {
    it('distância da ponta ao segmento 5–6, em palmas', () => {
      const lm = syntheticHand(false, 0.3);
      // segmento em x = 0.27, de y 0.6 (5) a 0.52 (6); palma 0.2
      lm[4] = { x: 0.27 - 0.06, y: 0.56, z: 0 };
      expect(thumbGap(lm)).toBeCloseTo(0.3);
      // para lá do PIP mede-se até ao PIP (projeção limitada)
      lm[4] = { x: 0.27 - 0.03, y: 0.48, z: 0 };
      expect(thumbGap(lm)).toBeCloseTo(0.25);
      // antes do MCP, até ao MCP
      lm[4] = { x: 0.27, y: 0.65, z: 0 };
      expect(thumbGap(lm)).toBeCloseTo(0.25);
      // o z conta atenuado, como em dist3
      lm[4] = { x: 0.27, y: 0.56, z: 0.1 };
      expect(thumbGap(lm)).toBeCloseTo(0.3);
    });

    it('pressão: 0 afastado, 1 encostado, linear entre os dois', () => {
      expect(thumbPress(GAP_OPEN)).toBe(0);
      expect(thumbPress(1)).toBe(0);
      expect(thumbPress(GAP_TOUCH)).toBe(1);
      expect(thumbPress(0)).toBe(1);
      expect(thumbPress((GAP_OPEN + GAP_TOUCH) / 2)).toBeCloseTo(0.5);
      expect(curls(syntheticHand(false, 0.3, 0.8, { thumb: 0 }))[0]).toBe(0);
      expect(curls(syntheticHand(false, 0.3, 0.8, { thumb: 1 }))[0]).toBe(1);
      // o punho sintético tem o polegar encostado
      expect(curls(syntheticHand(true))[0]).toBe(1);
    });

    it('a pressão sobe sempre ao aproximar o polegar', () => {
      let prev = -1;
      for (let t = 0; t <= 1.0001; t += 0.05) {
        const p = curls(syntheticHand(false, 0.3, 0.8, { thumb: t }))[0];
        expect(p).toBeGreaterThanOrEqual(prev);
        prev = p;
      }
    });

    it('não muda com a rotação, a inclinação nem a escala da mão (±0.03)', () => {
      for (const thumb of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
        const ref = curls(syntheticHand(false, 0.5, 0.5, { thumb }))[0];
        for (const rot of [0, 45, 90, 135])
          for (const tilt of [0, -35, 30])
            for (const scale of [0.6, 1, 1.5]) {
              const p = curls(syntheticHand(false, 0.5, 0.5, { thumb, rot, tilt, scale }))[0];
              expect(Math.abs(p - ref), `${thumb} ${rot}° ${tilt}° ×${scale}`).toBeLessThan(0.03);
            }
      }
    });

    it('vídeo 16:9: em unidades quadradas dá a mesma pressão a 0/45/90°', () => {
      const A = 640 / 360;
      for (const thumb of [0, 0.3, 0.5, 0.7, 0.9, 1])
        for (const rot of [0, 45, 90]) {
          const sq = syntheticHand(false, 0.5, 0.5, { thumb, rot });
          const wide = syntheticHand(false, 0.5, 0.5, { thumb, rot, aspect: A });
          expect(thumbGap(wide, A)).toBeCloseTo(thumbGap(sq), 6);
          expect(curls(wide, A)[0]).toBeCloseTo(curls(sq)[0], 6);
        }
      // sem a correção, o mesmo polegar afastado parecia muito mais perto do indicador
      const apart = syntheticHand(false, 0.5, 0.5, { thumb: 0.5, aspect: A });
      expect(thumbGap(apart)).toBeLessThan(thumbGap(apart, A) * 0.7);
    });

    it('a correção do vídeo só mexe no polegar', () => {
      const lm = syntheticHand([false, true, false, true, false], 0.4, 0.6, { aspect: 16 / 9 });
      expect(curls(lm, 16 / 9).slice(1)).toEqual(curls(lm).slice(1));
    });

    it('a pose (rotação, inclinação e escala) não mexe nas dobras dos outros dedos', () => {
      const ref = curls(syntheticHand([false, true, false, false, true], 0.5, 0.5));
      const c = curls(
        syntheticHand([false, true, false, false, true], 0.5, 0.5, {
          rot: 45,
          tilt: 30,
          scale: 1.3,
        }),
      );
      for (let j = 1; j < 5; j++) expect(c[j]).toBeCloseTo(ref[j], 1);
    });
  });
});
