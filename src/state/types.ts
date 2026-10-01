export type Engine = 'none' | 'hands' | 'motion' | 'keyboard';
export type Quantize = 'off' | '1/8' | '1/16';
export type ThemeName = 'dark' | 'light';
export type LoopBars = 1 | 2 | 4;
/** Origem da última nota (ver `noteSrc` no store). */
export type NoteSrc =
  { midis: number[]; chord?: import('../audio/theory').ChordMode } | { kit: string; slot: number };

/** Tabs da folha de configuração (a última fica lembrada durante a sessão). */
export type SheetTab = 'som' | 'notas' | 'efeitos' | 'estudio';
/** Dicas do primeiro uso (cada uma aparece até se cumprir). */
export type CoachId = 'hands' | 'bend' | 'mouth' | 'touch';
export type MouthFxId =
  'wah' | 'filter' | 'dist' | 'echo' | 'vibrato' | 'robot' | 'tremolo' | 'swell' | 'off';

export const MOUTH_FX: { id: MouthFxId; label: string; desc: string }[] = [
  { id: 'wah', label: 'Wah', desc: 'O som abre como uma voz' },
  { id: 'filter', label: 'Filtro', desc: 'Fechada abafa, aberta brilha' },
  { id: 'dist', label: 'Distorção', desc: 'Satura com a boca aberta' },
  { id: 'echo', label: 'Eco espacial', desc: 'Repetições que se prolongam' },
  { id: 'vibrato', label: 'Vibrato', desc: 'O tom ondula' },
  { id: 'robot', label: 'Voz de robô', desc: 'Modulação em anel' },
  { id: 'tremolo', label: 'Tremolo', desc: 'O volume pulsa' },
  { id: 'swell', label: 'Expressão', desc: 'Só soa com a boca aberta' },
  { id: 'off', label: 'Nenhum', desc: 'Sem efeito' },
];

/** Limiares por dedo obtidos na calibração (null = usa a sensibilidade). */
export interface Calibration {
  open: number[]; // dobra média com os dedos esticados (10)
  closed: number[]; // dobra média com os dedos dobrados (10)
}
