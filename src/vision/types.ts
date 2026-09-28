/** Ponto normalizado (0..1) já em espelho: x=0 é a esquerda do ecrã. */
export interface Pt {
  x: number;
  y: number;
  z: number;
}
export type HandLandmarks = Pt[]; // 21 pontos
/** [mão esquerda do ecrã, mão direita do ecrã] */
export type AssignedHands = [HandLandmarks | null, HandLandmarks | null];
