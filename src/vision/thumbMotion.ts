// Polegar: toca ao dobrar (para dentro da palma) ou ao mover-se para baixo, em relação à mão
// (docs/DECISIONS.md, 65). A medida de encostar ao indicador (`thumbGap`) dependia da profundidade
// e da forma da mão, e com a mão inclinada quase não mudava. Aqui a ponta do polegar mede-se num
// referencial preso à palma e a "pressão" é o afastamento a um repouso que a acompanha devagar,
// só nas direções de tocar: para cima ou para fora não conta. O polegar parado volta a 0 sozinho
// (é um toque, não um botão).
import { clamp } from '../audio/theory';
import { squarePt } from './fingerCurl';
import type { Pt } from './types';

/**
 * Tempo (s) com que o repouso apanha o polegar. Um toque decidido dura ~0,1–0,2 s e chega a
 * ~70–80% do afastamento antes de o repouso o seguir; parado, a pressão desce a metade em ~0,3 s.
 */
export const THUMB_BASE_TAU = 0.4;
/**
 * Tempo (s) com que o repouso segue o polegar nas direções que não tocam (para cima, para fora).
 * Mais lento do que `THUMB_BASE_TAU`: subir o polegar e voltar ao sítio não pode contar como um
 * movimento para baixo. Só fica a contar se o polegar ficar em cima mais de ~1 s.
 */
export const THUMB_BACK_TAU = 1.5;
/**
 * Afastamento ao repouso (em unidades da palma, ver `palmCoords`) que dá pressão 1. Um toque
 * do polegar desloca a ponta ~0,25–0,5; o arrasto dos outros dedos e o tremor ficam abaixo de
 * ~0,08. Com `THUMB_ON` (0.65), a suavização e a confirmação, a nota pede ~0,21 (a 30 e a 60 fps).
 */
export const THUMB_MOVE_FULL = 0.25;
/**
 * Abaixo deste seno do ângulo entre os eixos da palma, a mão está de lado (a palma em fio) e as
 * coordenadas deixam de ser fiáveis: sem medida.
 */
export const THUMB_MIN_SIN = 0.3;
/**
 * Abaixo desta proporção entre o eixo mais curto e o mais comprido da palma, a mão está quase de
 * lado (inclinada mais de ~80°): sem medida.
 */
export const THUMB_MIN_RATIO = 0.25;
/**
 * Largura da palma (5 → 17) a dividir pelo comprimento (0 → 9) numa mão real: o u passa para a
 * mesma escala do v, para um toque de lado contar como um toque para cima.
 */
export const PALM_WIDTH_RATIO = 0.8;
/**
 * Direção de tocar, em coordenadas da palma: a meio caminho entre dobrar (+u, para o lado do
 * mindinho) e para baixo (−v, para o pulso). Um movimento conta por inteiro até `THUMB_DIR_FULL`
 * graus desta direção, nada a partir de `THUMB_DIR_ZERO` e em parte entre os dois: dobrar e para
 * baixo (a 45°) contam, para cima, para fora e as diagonais para cima (a 90° ou mais) não.
 */
const PRESS_DIR = { u: Math.SQRT1_2, v: -Math.SQRT1_2 };
export const THUMB_DIR_FULL = 55;
export const THUMB_DIR_ZERO = 80;
const COS_FULL = Math.cos((THUMB_DIR_FULL * Math.PI) / 180);
const COS_ZERO = Math.cos((THUMB_DIR_ZERO * Math.PI) / 180);

/** Peso (0..1) de um deslocamento (du, dv) pela direção (ver `PRESS_DIR`). */
export function directionWeight(du: number, dv: number): number {
  const d = Math.hypot(du, dv);
  if (!d) return 0;
  const cos = (du * PRESS_DIR.u + dv * PRESS_DIR.v) / d;
  return clamp((cos - COS_ZERO) / (COS_FULL - COS_ZERO), 0, 1);
}

/** Sem medida, a pressão cai por este fator a cada fotograma. */
const LOST_DECAY = 0.6;

export interface PalmUV {
  u: number;
  v: number;
}

/**
 * Ponta do polegar em coordenadas afins da palma (2D, em unidades quadradas): origem no pulso
 * (0), eixo u da base do indicador (5) à base do mindinho (17) e eixo v do pulso à base do médio
 * (9), com o u na escala do v (ver `PALM_WIDTH_RATIO`). As afins não mudam ao mover, rodar ou escalar a mão e quase não mudam ao incliná-la (a
 * palma vista de esguelha encolhe por igual nos dois eixos). O z do MediaPipe não entra: é o
 * menos fiável dos três. `null` com a mão de lado (ver `THUMB_MIN_SIN` e `THUMB_MIN_RATIO`).
 */
export function palmCoords(lm: Pt[], aspect = 1): PalmUV | null {
  const o = squarePt(lm[0], aspect);
  const a = squarePt(lm[5], aspect);
  const b = squarePt(lm[17], aspect);
  const c = squarePt(lm[9], aspect);
  const p = squarePt(lm[4], aspect);
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - o.x;
  const vy = c.y - o.y;
  const det = ux * vy - uy * vx;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (
    det === 0 ||
    Math.abs(det) < THUMB_MIN_SIN * lu * lv ||
    Math.min(lu, lv) < THUMB_MIN_RATIO * Math.max(lu, lv)
  )
    return null;
  const dx = p.x - o.x;
  const dy = p.y - o.y;
  return {
    u: ((dx * vy - dy * vx) / det) * PALM_WIDTH_RATIO,
    v: (ux * dy - uy * dx) / det,
  };
}

/** Pressão de movimento de um polegar, só nas direções de tocar (uma instância por mão). */
export class ThumbMotion {
  private base: PalmUV | null = null;
  /** Repouso de antes do toque (ver `markStart` e `release`). */
  private anchor: PalmUV | null = null;
  private press = 0;

  reset(): void {
    this.base = null;
    this.anchor = null;
    this.press = 0;
  }

  /** Pressão 0..1 deste fotograma; dt em segundos. */
  update(lm: Pt[], aspect: number, dt: number): number {
    const p = palmCoords(lm, aspect);
    if (!p) {
      // de lado: sem medida; ao voltar, o repouso recomeça onde o polegar estiver
      this.base = null;
      this.press *= LOST_DECAY;
      return this.press;
    }
    const base = this.base;
    if (!base) {
      this.base = { ...p };
      this.press = 0;
      return 0;
    }
    const du = p.u - base.u;
    const dv = p.v - base.v;
    this.press = clamp((Math.hypot(du, dv) * directionWeight(du, dv)) / THUMB_MOVE_FULL, 0, 1);
    const k = 1 - Math.exp(-dt / (this.press > 0 ? THUMB_BASE_TAU : THUMB_BACK_TAU));
    base.u += (p.u - base.u) * k;
    base.v += (p.v - base.v) * k;
    return this.press;
  }

  /** O polegar começou a confirmar uma nota: guarda o repouso de onde partiu. */
  markStart(): void {
    if (this.base) this.anchor = { ...this.base };
  }

  /**
   * A nota do polegar soltou: o repouso volta ao sítio de onde o polegar partiu, para o regresso
   * a esse sítio não contar como um movimento novo.
   */
  release(): void {
    if (this.anchor && this.base) this.base = { ...this.anchor };
    this.anchor = null;
  }
}
