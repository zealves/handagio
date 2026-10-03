// Modo de jogo: tipos partilhados (lógica pura, sem React nem áudio).

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Uma nota a apanhar. `step` em semicolcheias a partir do compasso 1 (depois da entrada). */
export interface ChartNote {
  step: number;
  /** Faixa, 0 = a mais à esquerda (toca o grau 0 da escala). */
  lane: number;
  /** Duração em semicolcheias (o acerto soa no máximo `MAX_HIT_STEPS`). */
  dur: number;
}

/** Acompanhamento: bateria (kit acústico) ou baixo (grau da escala). Steps negativos = entrada. */
export type BackingEvent =
  | { step: number; kind: 'drum'; slot: number; vel: number }
  | { step: number; kind: 'bass'; degree: number; dur: number; vel: number };

/**
 * Partitura de uma ronda. O gerador procedural produz isto; um leitor de MIDI ou músicas
 * curadas poderão produzir o mesmo formato sem mexer no resto do jogo.
 */
export interface Chart {
  bpm: number;
  /** Compassos, sem o compasso de entrada. */
  bars: number;
  lanes: number;
  /** Ordenadas por `step`. */
  notes: ChartNote[];
  /** Ordenados por `step`. */
  backing: BackingEvent[];
  /** Atraso das colcheias em contratempo (passos; 0 = direito). */
  swing: number;
  /** Faixas da mão esquerda, `[0, split)`; as restantes são da direita. */
  split: number;
}

export type Judgement = 'perfect' | 'good';

export interface GameResult {
  points: number;
  /** 0..1: (Perfeito + 0,5 × Bom) / (notas + 0,5 × toques errados), limitada a 1. */
  accuracy: number;
  maxCombo: number;
  perfect: number;
  good: number;
  miss: number;
  total: number;
  /** Atraso médio dos acertos em ms (positivo = tarde); null sem acertos. */
  meanOffsetMs: number | null;
  /** "Tarde!" da câmara na ronda. */
  lateTaps: number;
  /** Toques errados (fora de qualquer nota por julgar) na ronda. */
  wrongTaps: number;
  best: boolean;
  /** Atraso com que a ronda começou (ms, arredondado como `lagMs`). */
  startLagMs: number;
  /** Atraso aprendido na ronda (ms), quando houve toques da câmara suficientes; senão null. */
  lagMs: number | null;
  /** Estrelas ganhas nesta ronda (0 a 3). */
  stars: number;
  /** Id do nível que esta ronda desbloqueou, se foi o caso (senão null). */
  unlocked: string | null;
  /** Id do nível desta ronda. */
  levelId: string;
}
