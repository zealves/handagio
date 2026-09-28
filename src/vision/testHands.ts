// Landmarks sintéticos para testes: mão aberta (dedos esticados para cima) e fechada (punho).
import type { Pt } from './types';

const P = (x: number, y: number, z = 0): Pt => ({ x, y, z });

export function syntheticHand(closed: boolean[] | boolean, wristX = 0.3, wristY = 0.8): Pt[] {
  const c = (k: number) => (Array.isArray(closed) ? closed[k] : closed);
  const lm: Pt[] = new Array(21);
  lm[0] = P(wristX, wristY);
  // Polegar (1..4)
  if (c(0)) {
    lm[1] = P(wristX - 0.05, wristY - 0.05);
    lm[2] = P(wristX - 0.06, wristY - 0.1);
    lm[3] = P(wristX - 0.03, wristY - 0.14);
    lm[4] = P(wristX + 0.0, wristY - 0.17, -0.03);
  } else {
    lm[1] = P(wristX - 0.05, wristY - 0.04);
    lm[2] = P(wristX - 0.1, wristY - 0.08);
    lm[3] = P(wristX - 0.15, wristY - 0.12);
    lm[4] = P(wristX - 0.2, wristY - 0.16);
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
  return lm;
}
