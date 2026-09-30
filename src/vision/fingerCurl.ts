// Dobra de cada dedo (0 = esticado, 1 = dobrado). Fórmulas copiadas do protótipo, menos a do
// polegar, que mede o encostar ao lado do indicador (docs/DECISIONS.md, 63).
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

/**
 * Polegar: distância da ponta (4) ao segmento entre o MCP (5) e o PIP (6) do indicador, a dividir
 * pelo tamanho da palma (`dist3(0, 9)`), com o z atenuado como em `dist3`. O polegar não dobra
 * como os outros dedos: anda para o lado e toca ao encostar ao lado do indicador. Tudo é relativo
 * à própria mão, por isso a medida não muda com a rotação, a inclinação nem a escala.
 */
export function thumbGap(lm: Pt[]): number {
  const palm = dist3(lm[0], lm[9]) || 1;
  const p = lm[4];
  const a = lm[5];
  const b = lm[6];
  const Z = 0.6; // o mesmo peso do z que em `dist3`
  const ab = { x: b.x - a.x, y: b.y - a.y, z: (b.z - a.z) * Z };
  const ap = { x: p.x - a.x, y: p.y - a.y, z: (p.z - a.z) * Z };
  const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = len2 > 0 ? clamp((ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2, 0, 1) : 0;
  return Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t) / palm;
}

/**
 * Polegar afastado: a partir desta distância (em palmas) a pressão é 0. Numa mão aberta com o
 * polegar esticado para o lado a ponta fica a ~0.8–0.9 palmas do segmento; 0.6 deixa margem para
 * um polegar mais fechado continuar a contar como afastado.
 */
export const GAP_OPEN = 0.6;
/**
 * Polegar encostado: a esta distância (em palmas) a pressão é 1. Os pontos do MediaPipe ficam no
 * eixo dos ossos, por isso dois dedos encostados continuam com os centros a ~1,5–2 cm (~0.15–0.2
 * palmas); 0.15 dá pressão perto de 1 sem ser preciso esmagar.
 */
export const GAP_TOUCH = 0.15;

/** Pressão do polegar (0 = afastado, 1 = encostado ao lado do indicador). */
export const thumbPress = (gap: number): number =>
  clamp((GAP_OPEN - gap) / (GAP_OPEN - GAP_TOUCH), 0, 1);

/** Devolve 5 valores: polegar (a pressão, ver `thumbGap`), indicador, médio, anelar, mindinho. */
export function curls(lm: Pt[]): number[] {
  const palm = dist3(lm[0], lm[9]) || 1;
  const out: number[] = [thumbPress(thumbGap(lm))];
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
