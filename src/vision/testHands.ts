// Landmarks sintéticos para testes: mão aberta (dedos esticados para cima) e fechada (punho).
import type { Pt } from './types';

const P = (x: number, y: number, z = 0): Pt => ({ x, y, z });

/** Polegar afastado para o lado (pontos 1..4, relativos ao pulso). */
const THUMB_OPEN: Pt[] = [P(-0.05, -0.04), P(-0.1, -0.08), P(-0.15, -0.12), P(-0.2, -0.16)];
/**
 * Polegar encostado ao lado do indicador: a ponta fica a 0.02 (0.1 palmas) do segmento entre o
 * MCP e o PIP do indicador (x = −0.03, de y −0.2 a −0.28).
 */
const THUMB_TOUCH: Pt[] = [P(-0.05, -0.05), P(-0.09, -0.1), P(-0.085, -0.16), P(-0.05, -0.22)];

/** Pose opcional da mão sintética. */
export interface HandPose {
  /**
   * Polegar entre afastado (0) e encostado ao lado do indicador (1); por defeito vem de
   * `closed[0]`. Os pontos interpolam-se em linha reta entre as duas poses.
   */
  thumb?: number;
  /** Rotação no plano da imagem, em graus, à volta do pulso. */
  rot?: number;
  /**
   * Inclinação (graus) à volta do eixo horizontal que passa pelo pulso: a mão deita-se para a
   * câmara. O z sai na escala que `dist3` assume (profundidade = z × 0.6).
   */
  tilt?: number;
  /** Escala à volta do pulso (mão mais perto ou mais longe da câmara). */
  scale?: number;
}

export function syntheticHand(
  closed: boolean[] | boolean,
  wristX = 0.3,
  wristY = 0.8,
  pose: HandPose = {},
): Pt[] {
  const c = (k: number) => (Array.isArray(closed) ? closed[k] : closed);
  const lm: Pt[] = new Array(21);
  lm[0] = P(wristX, wristY);
  // Polegar (1..4)
  const t = pose.thumb ?? (c(0) ? 1 : 0);
  for (let k = 0; k < 4; k++) {
    const a = THUMB_OPEN[k];
    const b = THUMB_TOUCH[k];
    lm[k + 1] = P(wristX + a.x + (b.x - a.x) * t, wristY + a.y + (b.y - a.y) * t);
  }
  const xs = [-0.03, 0, 0.03, 0.06];
  for (let k = 0; k < 4; k++) {
    const x = wristX + xs[k];
    const b = 5 + k * 4;
    lm[b] = P(x, wristY - 0.2); // MCP
    if (c(k + 1)) {
      lm[b + 1] = P(x, wristY - 0.27, -0.03); // PIP
      lm[b + 2] = P(x, wristY - 0.23, -0.07); // DIP
      lm[b + 3] = P(x, wristY - 0.17, -0.05); // ponta
    } else {
      lm[b + 1] = P(x, wristY - 0.28);
      lm[b + 2] = P(x, wristY - 0.33);
      lm[b + 3] = P(x, wristY - 0.38);
    }
  }
  const { rot = 0, tilt = 0, scale = 1 } = pose;
  return rot || tilt || scale !== 1 ? transform(lm, rot, tilt, scale) : lm;
}

/** Inclina, roda e escala a mão à volta do pulso (ver `HandPose`). */
function transform(lm: Pt[], rot: number, tilt: number, scale: number): Pt[] {
  const w = lm[0];
  const [cr, sr] = [Math.cos((rot * Math.PI) / 180), Math.sin((rot * Math.PI) / 180)];
  const [ct, st] = [Math.cos((tilt * Math.PI) / 180), Math.sin((tilt * Math.PI) / 180)];
  return lm.map((p) => {
    const x = (p.x - w.x) * scale;
    let y = (p.y - w.y) * scale;
    let d = (p.z - w.z) * 0.6 * scale;
    [y, d] = [y * ct - d * st, y * st + d * ct];
    return P(w.x + x * cr - y * sr, w.y + x * sr + y * cr, w.z + d / 0.6);
  });
}
