// Dobra de cada dedo (0 = esticado, 1 = dobrado). Fórmulas copiadas do protótipo.
import { clamp } from '../audio/theory';
import type { Pt } from './types';

export const dist3 = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);

/** Ângulo em graus no ponto b, entre a e c. */
export function angleAt(a: Pt, b: Pt, c: Pt): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const m = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  return (Math.acos(clamp(dot / (m || 1), -1, 1)) * 180) / Math.PI;
}

const FINGERS: [number, number, number, number][] = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

/** Devolve 5 valores: polegar, indicador, médio, anelar, mindinho. */
export function curls(lm: Pt[]): number[] {
  const palm = dist3(lm[0], lm[9]) || 1;
  const out: number[] = [];
  // Polegar: fórmula própria.
  const tDist = dist3(lm[4], lm[5]) / palm;
  const tDist2 = dist3(lm[4], lm[13]) / palm;
  const tAng = angleAt(lm[2], lm[3], lm[4]);
  out.push(
    clamp(
      0.5 * clamp((1.0 - tDist) / 0.7, 0, 1) +
        0.3 * clamp((1.25 - tDist2) / 0.7, 0, 1) +
        0.2 * clamp((175 - tAng) / 50, 0, 1),
      0,
      1,
    ),
  );
  // Restantes: 60% ângulos PIP/DIP + 40% distância ponta–pulso normalizada pela palma.
  for (const [m, p, dd, t] of FINGERS) {
    const a1 = angleAt(lm[m], lm[p], lm[dd]);
    const a2 = angleAt(lm[p], lm[dd], lm[t]);
    const angCurl = clamp((180 - a1 + (180 - a2) * 0.6) / 170, 0, 1);
    const distCurl = clamp((1.9 - dist3(lm[t], lm[0]) / palm) / 1.1, 0, 1);
    out.push(clamp(0.6 * angCurl + 0.4 * distCurl, 0, 1));
  }
  return out;
}
