// Mapeamento dos 10 dedos. Índices: 0..4 mão esquerda (polegar..mindinho), 5..9 mão direita.
// Copiado do protótipo: disposição de piano, mindinho esquerdo = grave, mindinho direito = agudo.

export const FINGER_NAMES = ['Polegar', 'Indicador', 'Médio', 'Anelar', 'Mindinho'] as const;
/** Ordem no ecrã, da esquerda para a direita. */
export const SCREEN_ORDER = [4, 3, 2, 1, 0, 5, 6, 7, 8, 9] as const;
/** Pontas dos dedos no modelo de 21 pontos. */
export const TIP_IDS = [4, 8, 12, 16, 20] as const;

export const isActive = (i: number, thumbs: boolean): boolean => thumbs || i % 5 !== 0;

/** Posição do dedo no kit de percussão (0..7 sem polegares, 0..9 com). -1 = inativo. */
export function slotOf(i: number, thumbs: boolean): number {
  return thumbs ? i : [-1, 0, 1, 2, 3, -1, 4, 5, 6, 7][i];
}

/**
 * Grau da escala de cada dedo, antes do deslocamento pela altura da mão.
 * Com polegares o protótipo usava `(4 − j) − n`, o que deixava um salto nas escalas que não
 * têm 5 notas; aqui os 10 dedos ficam sempre seguidos (-5..4). Ver docs/DECISIONS.md.
 */
export function fingerDegree(i: number, thumbs: boolean): number {
  const j = i % 5;
  if (!thumbs) return i < 5 ? 4 - j - 4 : j - 1;
  return i < 5 ? 4 - j - 5 : j;
}

/** Dedo onde fica a tónica (grau 0) no modo Escala. */
export type TonicAt = 'right-index' | 'left-pinky';

/**
 * Grau da escala de cada dedo conforme o sítio da tónica. Com `'left-pinky'` os graus sobem da
 * esquerda para a direita pela ordem do ecrã a partir de 0 (mindinho esquerdo): 0..7 sem
 * polegares, 0..9 com. Como `fingerDegree` já é seguido nos dedos ativos, basta deslocá-lo.
 */
export function fingerDegreeFor(i: number, thumbs: boolean, tonicAt: TonicAt): number {
  const d = fingerDegree(i, thumbs);
  return tonicAt === 'left-pinky' ? d - fingerDegree(4, thumbs) : d;
}

export const fingerLabel = (i: number): string => (i < 5 ? 'E ' : 'D ') + FINGER_NAMES[i % 5];

/** Dedos ativos pela ordem do ecrã. */
export const activeScreenOrder = (thumbs: boolean): number[] =>
  SCREEN_ORDER.filter((i) => isActive(i, thumbs));

/** Mapa do modo teclado: A S D F (esquerda) e J K L Ç (direita); G e H são os polegares. */
export const KEYMAP: Record<string, number> = {
  a: 4,
  s: 3,
  d: 2,
  f: 1,
  g: 0,
  h: 5,
  j: 6,
  k: 7,
  l: 8,
  ç: 9,
  ';': 9,
};
