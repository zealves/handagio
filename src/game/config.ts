// Modo de jogo: constantes (dedos, tempo, janelas do juiz e pontos).
import type { Difficulty } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

/** A dificuldade decide o tempo e a densidade; os dedos escolhem-se à parte. */
export interface DifficultyConfig {
  bpm: number;
  /** Compassos da ronda (múltiplos de 8, a forma A A' B A): ~85–89 s. */
  bars: number;
  /** Segundos que uma nota leva do topo da pista à linha de impacto. */
  lead: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { bpm: 90, bars: 32, lead: 2.4 },
  medium: { bpm: 110, bars: 40, lead: 2.0 },
  hard: { bpm: 130, bars: 48, lead: 1.7 },
};

/** Dedos que podem jogar, pela ordem do ecrã (sem polegares: a deteção deles é outra). */
export const GAME_FINGER_CHOICES: readonly number[] = [4, 3, 2, 1, 6, 7, 8, 9];
/** Por defeito: indicadores e médios, os dedos mais independentes na câmara. */
export const DEFAULT_GAME_FINGERS: readonly number[] = [2, 1, 6, 7];
export const MIN_GAME_FINGERS = 2;

/** Faixa de um dedo na escolha atual (−1: o dedo não joga). */
export const laneOf = (finger: number, fingers: readonly number[]): number =>
  fingers.indexOf(finger);

/** Dedos válidos, sem repetidos, pela ordem do ecrã; null com menos de `MIN_GAME_FINGERS`. */
export function normalizeGameFingers(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const chosen = new Set(v.filter((f): f is number => typeof f === 'number'));
  const out = GAME_FINGER_CHOICES.filter((f) => chosen.has(f));
  return out.length >= MIN_GAME_FINGERS ? out : null;
}

/** Janela do Perfeito (s, de cada lado). Larga: a câmara tem fotogramas de 33 ms e tremor. */
export const PERFECT_S = 0.1;
/** Janela do Bom; depois dela a nota conta como falhada. */
export const GOOD_S = 0.2;
/** Até aqui um toque fora da janela diz "Cedo!"/"Tarde!" (sem pontos, sem gastar a nota). */
export const NEAR_S = 0.35;
/** Um toque errado até aqui depois de um acerto numa faixa vizinha da mesma mão não conta (o dedo ao lado arrastado ou um segundo disparo do mesmo dedo). */
export const NEIGHBOUR_GRACE_S = 0.15;
/** Peso de um toque errado na precisão. */
export const WRONG_TAP_WEIGHT = 0.5;
export const POINTS: Record<'perfect' | 'good', number> = { perfect: 100, good: 50 };
/** O multiplicador sobe 1 a cada `COMBO_STEP` acertos seguidos, até `MAX_MULTIPLIER`. */
export const COMBO_STEP = 10;
export const MAX_MULTIPLIER = 4;

/** Atraso por defeito da câmara e da deteção (ms), descontado aos toques; a afinar com mãos reais. */
export const GAME_INPUT_LAG_MS = 120;
export const LAG_MIN_MS = 0;
/** Também o teto do atraso aprendido. */
export const LAG_MAX_MS = 300;
export const LAG_STEP_MS = 10;
/** Quanto do desvio de cada toque da câmara passa para o atraso da ronda. */
export const LAG_LEARN = 0.15;
/** Toques da câmara precisos para guardar o atraso aprendido. */
export const LAG_SAVE_MIN_HITS = 8;
/** Segundos → ms em passos de `LAG_STEP_MS`. */
export const roundLagMs = (seconds: number): number =>
  Math.round((seconds * 1000) / LAG_STEP_MS) * LAG_STEP_MS;

/**
 * Intervalo mínimo entre duas notas (s). Na câmara, um toque precisa de dobrar, confirmar
 * (2–3 imagens a 30 fps), esticar e voltar a dobrar: abaixo disto as notas "não contam".
 */
export const MIN_NOTE_GAP_S = 0.3;
/** Atalhos do seletor de dedos (pela ordem do ecrã). */
export const FINGER_PRESETS = {
  left: [4, 3, 2, 1],
  right: [6, 7, 8, 9],
  pairs: [2, 1, 6, 7],
} as const satisfies Record<string, readonly number[]>;

/** Compasso de entrada (semicolcheias). */
export const COUNT_IN_STEPS = 16;
/** Tempo depois do último compasso antes do resultado (s). */
export const END_TAIL_S = 0.6;
/** Margem (s) para lá do lookahead do relógio ao escolher o compasso de partida. */
export const START_MARGIN_S = 0.05;
/** Duração máxima (semicolcheias) da nota de um acerto: 1 tempo. */
export const MAX_HIT_STEPS = 4;
