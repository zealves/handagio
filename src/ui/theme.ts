/** 10 cores estáveis, uma por dedo (0..4 mão esquerda polegar→mindinho, 5..9 direita). */
export const FINGER_COLORS = [
  '#ffd166',
  '#ff9f5c',
  '#ff6f91',
  '#ff4fd8',
  '#b06bff',
  '#c6ff5c',
  '#5cffb1',
  '#35e0ff',
  '#3d9bff',
  '#8d7bff',
] as const;

export const NEON = {
  cyan: '#35e0ff',
  blue: '#3d7bff',
  violet: '#8b5cff',
  magenta: '#ff4fd8',
  /** Energia do jogo (Star Power), cheia ou ativa: dourado, em vez das cores de sempre. */
  gold: '#ffd166',
};

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
