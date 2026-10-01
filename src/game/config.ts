// Modo de jogo: constantes (faixas, tempo, janelas do juiz e pontos).
import type { Difficulty } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export interface DifficultyConfig {
  /** Dedos de cada faixa, pela ordem do ecrã (índices de `fingerMap`, sem polegares). */
  fingers: readonly number[];
  bpm: number;
  /** Compassos da ronda (múltiplos de 8, a forma A A' B A): ~85–89 s. */
  bars: number;
  /** Segundos que uma nota leva do topo da pista à linha de impacto. */
  lead: number;
}

/**
 * Fácil só com indicadores e médios (os dedos mais independentes na câmara); o anelar e o
 * mindinho mexem-se juntos e entram no Médio e no Difícil.
 */
export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: { fingers: [2, 1, 6, 7], bpm: 90, bars: 32, lead: 2.4 },
  medium: { fingers: [3, 2, 1, 6, 7, 8], bpm: 110, bars: 40, lead: 2.0 },
  hard: { fingers: [4, 3, 2, 1, 6, 7, 8, 9], bpm: 130, bars: 48, lead: 1.7 },
};

/** Faixa de um dedo nesta dificuldade (−1: o dedo não joga). */
export const laneOf = (finger: number, d: Difficulty): number =>
  DIFFICULTY[d].fingers.indexOf(finger);

/** Janela do Perfeito (s, de cada lado da nota). A câmara a 30 fps tem fotogramas de 33 ms. */
export const PERFECT_S = 0.07;
/** Janela do Bom; mais longe o toque é ignorado e, depois dela, a nota conta como falhada. */
export const GOOD_S = 0.15;
export const POINTS: Record<'perfect' | 'good', number> = { perfect: 100, good: 50 };
/** O multiplicador sobe 1 a cada `COMBO_STEP` acertos seguidos, até `MAX_MULTIPLIER`. */
export const COMBO_STEP = 10;
export const MAX_MULTIPLIER = 4;

/** Atraso por defeito da câmara e da deteção (ms), descontado aos toques; a afinar com mãos reais. */
export const GAME_INPUT_LAG_MS = 120;
export const LAG_MIN_MS = 0;
export const LAG_MAX_MS = 250;
export const LAG_STEP_MS = 10;

/** Compasso de entrada (semicolcheias). */
export const COUNT_IN_STEPS = 16;
/** Tempo depois do último compasso antes do resultado (s). */
export const END_TAIL_S = 0.6;
/** Margem (s) para lá do lookahead do relógio ao escolher o compasso de partida. */
export const START_MARGIN_S = 0.05;
/** Duração máxima (semicolcheias) da nota de um acerto: 1 tempo. */
export const MAX_HIT_STEPS = 4;
