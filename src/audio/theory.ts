// Teoria musical: escalas, graus, midi↔frequência e nomes das notas em português.
// Valores copiados do protótipo (reference/maos-musicais.html).

export const NOTE_NAMES = [
  'Dó',
  'Dó♯',
  'Ré',
  'Ré♯',
  'Mi',
  'Fá',
  'Fá♯',
  'Sol',
  'Sol♯',
  'Lá',
  'Lá♯',
  'Si',
] as const;

export const SCALES = {
  Maior: [0, 2, 4, 5, 7, 9, 11],
  Menor: [0, 2, 3, 5, 7, 8, 10],
  Pentatónica: [0, 2, 4, 7, 9],
  'Pentatónica menor': [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  Dórica: [0, 2, 3, 5, 7, 9, 10],
  Frígia: [0, 1, 3, 5, 7, 8, 10],
  Árabe: [0, 1, 4, 5, 7, 8, 11],
  Japonesa: [0, 1, 5, 7, 8],
  'Tons inteiros': [0, 2, 4, 6, 8, 10],
  Cromática: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

export interface Tuning {
  root: number; // 0..11 (Dó..Si)
  scale: ScaleName;
  octave: number; // 1..6
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Grau da escala (pode ser negativo ou passar a oitava) → nota MIDI. */
export function degreeToMidi(d: number, t: Tuning): number {
  const sc = SCALES[t.scale];
  const n = sc.length;
  const o = Math.floor(d / n);
  const idx = ((d % n) + n) % n;
  return 12 * (t.octave + 1) + t.root + sc[idx] + 12 * o;
}

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);

export function noteName(m: number): string {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

/** Nome sem oitava ("Dó♯"). */
export function pitchClassName(m: number): string {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12];
}

export const scaleLength = (s: ScaleName): number => SCALES[s].length;
