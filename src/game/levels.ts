// Níveis do modo de jogo: cada um é uma música fixa (semente) com um estilo de som. A ordem é a
// de desbloqueio; para juntar um nível acrescenta-se uma entrada (e o nome em i18n pelo id).
import type { ScaleName } from '../audio/theory'; // só o tipo: `src/game` continua sem áudio
import type { Difficulty } from './types';

export type DrumStyle = 'straight' | 'swing' | 'four';
export type BassLine = 'eighths' | 'walk' | 'pulse';
export interface SoundStyle {
  melody: string;
  kit: string;
  bass: string;
  scale: ScaleName;
  root: number;
  octave: number;
  drums: DrumStyle;
  bassLine: BassLine;
  /** Atraso das colcheias em contratempo (passos; 0 = direito). */
  swing: number;
}
export interface Level {
  id: string;
  difficulty: Difficulty;
  bpm: number;
  bars: number;
  seed: number;
  style: SoundStyle;
}
export type LevelProgress = Record<string, { stars: number; points: number; accuracy: number }>;

/** Precisão mínima para 1, 2 e 3 estrelas. */
export const STAR_THRESHOLDS = [0.5, 0.7, 0.9] as const;

/**
 * Sementes escolhidas (lanes: 4, split: 2, como no teclado por defeito): de 20 candidatas por
 * nível (sementes 1–20, geradas com `generateChart` e os parâmetros de cada nível: `bars`,
 * `bpm`, `style.drums`, `style.bassLine`, `style.swing`), fica a primeira a cumprir as três
 * condições:
 * - subida de densidade clara, pelo menos +50% de notas entre a 1.ª e a última secção de 8
 *   compassos;
 * - nenhuma faixa repetida mais de 3 vezes seguidas;
 * - a última nota na tónica (garantido pelo gerador, mas confirmado à mesma).
 *
 * Valores das escolhidas: Pop semente 2 (15 → 23 notas, +53%, faixa repetida no máximo 2
 * vezes); Lo-fi semente 4 (16 → 29, +81%, no máximo 2 vezes); Eletrónico semente 2 (25 → 40,
 * +60%, no máximo 2 vezes).
 */
const SEED_POP = 2;
const SEED_LOFI = 4;
const SEED_ELECTRO = 2;

export const LEVELS: readonly Level[] = [
  { id: 'pop', difficulty: 'easy', bpm: 90, bars: 32, seed: SEED_POP,
    style: { melody: 'piano', kit: 'drums', bass: 'bass', scale: 'Maior', root: 0, octave: 4,
             drums: 'straight', bassLine: 'eighths', swing: 0 } },
  { id: 'lofi', difficulty: 'medium', bpm: 96, bars: 32, seed: SEED_LOFI,
    style: { melody: 'epiano', kit: 'drums', bass: 'contrabass', scale: 'Dórica', root: 2, octave: 4,
             drums: 'swing', bassLine: 'walk', swing: 0.6 } },
  { id: 'electro', difficulty: 'hard', bpm: 118, bars: 32, seed: SEED_ELECTRO,
    style: { melody: 'synth', kit: 'tr808', bass: 'bass', scale: 'Menor', root: 9, octave: 4,
             drums: 'four', bassLine: 'pulse', swing: 0 } },
];

export const starsFor = (acc: number): 0 | 1 | 2 | 3 =>
  (STAR_THRESHOLDS.filter((t) => acc >= t).length as 0 | 1 | 2 | 3);
export const levelIndex = (id: string): number => LEVELS.findIndex((l) => l.id === id);
/** O primeiro está sempre aberto; os outros abrem com ★ no anterior. */
export function isUnlocked(index: number, progress: LevelProgress): boolean {
  if (index <= 0) return index === 0;
  const prev = LEVELS[index - 1];
  return !!prev && (progress[prev.id]?.stars ?? 0) >= 1;
}
