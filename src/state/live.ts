// Store transitório: valores de alta frequência lidos pelos canvas no seu próprio rAF.
// Nunca passa por estado React.
import { newFinger, type FingerLive } from '../vision/gestureEngine';
import type { Pt } from '../vision/types';

export interface FingerFx {
  flash: number; // 1 no disparo, decai para 0
  label: string; // nome da nota ou do som
  midi: number;
}

export interface Burst {
  x: number; // 0..1 no palco
  y: number;
  color: string;
  t: number;
  strength: number;
}

export const live = {
  fingers: Array.from({ length: 10 }, newFinger) as FingerLive[],
  fx: Array.from({ length: 10 }, () => ({ flash: 0, label: '', midi: 0 })) as FingerFx[],
  hands: [] as Pt[][],
  handsT: 0,
  lips: null as Pt[] | null,
  lipsT: 0,
  mouth: 0,
  mouthTarget: 0,
  spaceHeld: false,
  videoW: 1280,
  videoH: 720,
  /** Notas MIDI a soar agora → intensidade (para o teclado de piano). */
  notes: new Map<number, { level: number; color: string }>(),
  /** Pads de percussão iluminados (8). */
  pads: new Array<number>(10).fill(0),
  /** Disparos recentes para a onda de partículas. */
  bursts: [] as Burst[],
  /** Contador de fotogramas de deteção (para o HUD). */
  fps: 0,
};

export function pushBurst(b: Omit<Burst, 't'>): void {
  live.bursts.push({ ...b, t: performance.now() });
  if (live.bursts.length > 40) live.bursts.shift();
}
