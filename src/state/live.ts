// Store transitório: valores de alta frequência lidos pelos canvas no seu próprio rAF.
// Nunca passa por estado React.
import { newFinger, type FingerLive } from '../vision/gestureEngine';
import type { Pt } from '../vision/types';
import type { GameRun } from '../game/run';

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

/**
 * Lado maior da resolução de desenho do overlay e da gravação de vídeo (o de antes, com a câmara a
 * 1280×720): não depende da resolução da câmara, que baixou para a deteção.
 */
export const DRAW_SIZE = 1280;

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
  /** Tamanho real do vídeo da câmara (só serve para a proporção; ver `drawSize`). */
  videoW: 640,
  videoH: 360,
  /** Notas MIDI a soar agora → intensidade (para o teclado de piano). */
  notes: new Map<number, { level: number; color: string; held: boolean }>(),
  /** Pads de percussão iluminados (8). */
  pads: new Array<number>(10).fill(0),
  /** Disparos recentes para a onda de partículas. */
  bursts: [] as Burst[],
  /** Passo atual do relógio (semicolcheias), para os indicadores de tempo. */
  step: -1,
  /** Contador de fotogramas de deteção (para o HUD). */
  fps: 0,
  /** Ronda do modo de jogo a decorrer (lida pelo canvas da pista); null fora do jogo. */
  game: null as GameRun | null,
};

/** Resolução de desenho: a proporção da câmara com o lado maior a `DRAW_SIZE`. */
export function drawSize(): { w: number; h: number } {
  const k = DRAW_SIZE / Math.max(live.videoW, live.videoH, 1);
  return { w: Math.round(live.videoW * k), h: Math.round(live.videoH * k) };
}

export function pushBurst(b: Omit<Burst, 't'>): void {
  live.bursts.push({ ...b, t: performance.now() });
  if (live.bursts.length > 40) live.bursts.shift();
}
