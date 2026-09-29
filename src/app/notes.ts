// Notas de cada dedo (lógica pura, sem React): modo Escala (grau da escala a partir da tónica)
// ou Personalizado (uma nota MIDI exata por dedo).
import { tuningOf } from '../audio/instruments';
import {
  chordMidis,
  customChord,
  degreeToMidi,
  type ChordMode,
  type ScaleName,
} from '../audio/theory';
import { fingerDegree, fingerDegreeFor, isActive, type TonicAt } from '../vision/fingerMap';

export type NoteMode = 'scale' | 'custom';

export interface NoteSettings {
  root: number;
  scale: ScaleName;
  octave: number;
  instrument: string;
  thumbs: boolean;
  chord: ChordMode;
  tonicAt: TonicAt;
  noteMode: NoteMode;
  customNotes: number[];
}

/** MIDI aceite numa nota personalizada (Dó1..Si7). */
export const CUSTOM_MIN = 24;
export const CUSTOM_MAX = 107;

/**
 * Notas personalizadas por defeito: as do modo Escala com Dó Pentatónica, oitava 4, tónica no
 * indicador direito e com polegares (Dó3 Ré3 Mi3 Sol3 Lá3 | Dó4 Ré4 Mi4 Sol4 Lá4).
 */
export const DEFAULT_CUSTOM_NOTES: readonly number[] = Array.from({ length: 10 }, (_, i) =>
  degreeToMidi(fingerDegree(i, true), { root: 0, scale: 'Pentatónica', octave: 4 }),
);

/** Garante 10 notas inteiras dentro do intervalo; o que faltar vem dos valores por defeito. */
export function normalizeCustomNotes(v: unknown): number[] {
  const a = Array.isArray(v) ? v : [];
  return DEFAULT_CUSTOM_NOTES.map((d, i) => {
    const m = a[i];
    return typeof m === 'number' && Number.isFinite(m)
      ? Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(m)))
      : d;
  });
}

/** Nota do modo Escala (com o registo do instrumento e o deslocamento em graus). */
export const scaleMidi = (i: number, shift: number, s: NoteSettings): number =>
  degreeToMidi(fingerDegreeFor(i, s.thumbs, s.tonicAt) + shift, tuningOf(s));

/** Nota MIDI de um dedo. No modo Personalizado a nota é exata: ignora o `shift` e o registo. */
export const fingerMidiOf = (i: number, shift: number, s: NoteSettings): number =>
  s.noteMode === 'custom' ? s.customNotes[i] : scaleMidi(i, shift, s);

/** Notas que um dedo toca (uma só ou o acorde). */
export function fingerChordOf(i: number, shift: number, s: NoteSettings): number[] {
  if (s.noteMode === 'custom') return customChord(s.customNotes[i], s.chord);
  return chordMidis(fingerDegreeFor(i, s.thumbs, s.tonicAt) + shift, tuningOf(s), s.chord);
}

/**
 * "Copiar da escala": as notas que cada dedo ativo toca agora no modo Escala (tónica, escala,
 * `tonicAt`, oitava e registo). Os polegares desligados guardam a nota que já tinham.
 */
export const notesFromScale = (s: NoteSettings): number[] =>
  s.customNotes.map((m, i) => (isActive(i, s.thumbs) ? scaleMidi(i, 0, s) : m));
