// Modo de jogo: constantes (dedos, tempo, janelas do juiz e pontos).
import type { Difficulty } from './types';
import type { AssignedHands } from '../vision/types';

/**
 * Slots comuns aos kits usados pelo jogo (`src/audio/drums/acoustic.ts` e `tr808.ts`): bombo,
 * tarola, choques, prato aberto, palmas, pela mesma ordem nos dois. (O `latin.ts` não segue
 * esta ordem — precisaria do seu próprio mapa se algum nível vier a usá-lo.)
 */
export const DRUM_SLOT = { kick: 0, snare: 1, hat: 2, openHat: 3, clap: 4 } as const;

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

/**
 * Lado da mão que não joga (para se esconder no overlay, decisão 73): só quando todos os
 * `fingers` são da mesma mão (todos < 5, a esquerda, ou todos ≥ 5, a direita). Com dedos das duas
 * mãos, ou sem nenhum escolhido, ninguém fica de fora.
 */
export function idleHandSide(fingers: readonly number[] | null): 'left' | 'right' | null {
  if (!fingers || !fingers.length) return null;
  if (fingers.every((f) => f < 5)) return 'right';
  if (fingers.every((f) => f >= 5)) return 'left';
  return null;
}

/**
 * Índice (0 = esquerda, 1 = direita) da mão que joga quando todos os `fingers` são da mesma mão,
 * ou null. Com uma só mão à vista, a sessão põe-na sempre nesse lado (`assignHands`, `onlySide`):
 * sozinha, a mão pode cair em qualquer lado e os seus dedos não tocariam nenhuma faixa.
 */
export function playingHandIdx(fingers: readonly number[] | null): 0 | 1 | null {
  const idle = idleHandSide(fingers);
  return idle === 'left' ? 1 : idle === 'right' ? 0 : null;
}

/**
 * Índice (0 = esquerda, 1 = direita) da mão a esconder no overlay, ou null para não esconder
 * nenhuma (decisão 73). `idleHandSide` diz qual seria pelos dedos escolhidos; só se segue essa
 * resposta quando a mão que joga está mesmo identificada em `assignedHands` — senão esconder-
 * se-ia a única mão à vista, só porque ficou atribuída ao lado errado (uma mão sozinha à frente
 * da câmara pode cair em qualquer lado, ver `assignHands`).
 */
export function hiddenHandIdx(
  fingers: readonly number[] | null,
  assignedHands: AssignedHands,
): 0 | 1 | null {
  const idle = idleHandSide(fingers);
  const idleIdx: 0 | 1 | null = idle === 'left' ? 0 : idle === 'right' ? 1 : null;
  const playingIdx: 0 | 1 | null = idleIdx === 0 ? 1 : idleIdx === 1 ? 0 : null;
  return idleIdx !== null && playingIdx !== null && assignedHands[playingIdx] !== null
    ? idleIdx
    : null;
}

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
/**
 * Um toque errado até aqui antes ou depois de um acerto na mesma faixa ou numa vizinha da mesma
 * mão não conta (o dedo ao lado arrastado ou um segundo disparo do mesmo dedo).
 */
export const NEIGHBOUR_GRACE_S = 0.15;
/** Peso de um toque errado na precisão. */
export const WRONG_TAP_WEIGHT = 0.5;
export const POINTS: Record<'perfect' | 'good', number> = { perfect: 100, good: 50 };
/** O multiplicador sobe 1 a cada `COMBO_STEP` acertos seguidos, até `MAX_MULTIPLIER`. */
export const COMBO_STEP = 10;
export const MAX_MULTIPLIER = 4;

/**
 * Energia (como o Star Power): a barra vai de 0 a 1. Cada Perfeito e cada Bom sobem-na (só fora
 * da energia ativa); cada falhado e cada toque errado tiram-lhe um pouco (decisão 74).
 */
export const ENERGY_PERFECT = 0.05;
export const ENERGY_GOOD = 0.025;
export const ENERGY_MISS = 0.1;
export const ENERGY_WRONG = 0.05;
/** Com a energia ativa, cada falhado ou toque errado corta isto (s) ao tempo que lhe falta. */
export const POWER_MISS_CUT_S = 1;

/**
 * Vida (decisão 74): de 0 a 1, começa em `LIFE_START`. Os acertos sobem-na; falhados, toques
 * errados e Cedo/Tarde descem-na. Em 0 a ronda acaba logo ("Falhaste!"), sem estrelas nem recorde.
 */
export const LIFE_START = 0.6;
export const LIFE_PERFECT = 0.03;
export const LIFE_GOOD = 0.02;
export const LIFE_MISS = 0.08;
export const LIFE_WRONG = 0.04;
export const LIFE_NEAR = 0.02;
/** Abaixo disto a pista avisa (bordos a pulsar a vermelho). */
export const LIFE_LOW = 0.25;
/** Duração da energia ativa (s, tempo de áudio); a barra desce de 1 a 0 neste tempo. */
export const POWER_S = 8;
/**
 * Mão fechada (decisão 75): ativa a energia quando os 4 dedos compridos de uma mão estão todos
 * com a dobra crua (`curls`, 0 esticado … 1 dobrado) acima disto. O polegar não conta (não joga).
 */
export const FIST_CURL = 0.6;
/** As dobras de uma mão (`curls`: polegar, indicador … mindinho) fazem uma mão fechada. */
export const isFist = (c: readonly number[]): boolean =>
  c.length >= 5 && c.slice(1, 5).every((x) => x >= FIST_CURL);
/** Durante a energia ativa, cada acerto vale isto vezes mais (já com o multiplicador do combo). */
export const POWER_MULTIPLIER = 2;
/** Quanto o reverb sobe enquanto a energia está ativa (limitado a 1; repõe-se ao acabar). */
export const POWER_REVERB_BOOST = 0.3;
/** Reverb a aplicar: o do jogador, ou com `POWER_REVERB_BOOST` somado enquanto a energia está
 *  ativa (decisão 73), sem nunca passar de 1. */
export const powerReverb = (base: number, active: boolean): number =>
  active ? Math.min(1, base + POWER_REVERB_BOOST) : base;

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
/**
 * O mesmo, mas para as notas escritas das músicas (níveis 2 e 3, `ChartNote.degree`): 2 tempos,
 * para as notas longas das frases soarem mais (ainda largadas antes se o dedo subir).
 */
export const MAX_SONG_HIT_STEPS = 8;
