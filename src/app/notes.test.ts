import { describe, expect, it } from 'vitest';
import { SAMPLED } from '../audio/instruments';
import { DEFAULT_SOUND } from '../state/store';
import {
  DEFAULT_CUSTOM_NOTES,
  fingerChordOf,
  fingerMidiOf,
  normalizeCustomNotes,
  notesFromScale,
  type NoteSettings,
} from './notes';

const base: NoteSettings = { ...DEFAULT_SOUND, thumbs: false };

describe('notas dos dedos', () => {
  it('notas personalizadas por defeito: Dó Maior, oitava 4, tónica no mindinho esquerdo', () => {
    // E: polegar..mindinho (Si3 Fá4 Mi4 Ré4 Dó4) | D: polegar..mindinho (Ré5 Sol4 Lá4 Si4 Dó5)
    expect([...DEFAULT_CUSTOM_NOTES]).toEqual([59, 65, 64, 62, 60, 74, 67, 69, 71, 72]);
    expect(DEFAULT_SOUND.customNotes).toEqual([...DEFAULT_CUSTOM_NOTES]);
    // os 8 dedos sem polegar tocam o mesmo que o modo Escala em Dó Maior com a tónica no mindinho
    const scale: NoteSettings = {
      ...base,
      instrument: 'piano',
      root: 0,
      scale: 'Maior',
      octave: 4,
      tonicAt: 'left-pinky',
    };
    for (const i of [1, 2, 3, 4, 6, 7, 8, 9])
      expect(DEFAULT_CUSTOM_NOTES[i]).toBe(fingerMidiOf(i, 0, scale));
  });

  it('modo Escala segue a tónica e o deslocamento', () => {
    expect(fingerMidiOf(6, 0, base)).toBe(60); // indicador direito = Dó4
    expect(fingerMidiOf(6, 1, base)).toBe(62);
    expect(fingerMidiOf(4, 0, { ...base, tonicAt: 'left-pinky' })).toBe(60);
    expect(fingerMidiOf(9, 0, { ...base, tonicAt: 'left-pinky' })).toBe(76); // grau 7 = Mi5
  });

  it('modo Personalizado: nota exata, sem deslocamento nem registo', () => {
    const bass = SAMPLED.find((x) => x.register !== 0)!;
    const s: NoteSettings = { ...base, noteMode: 'custom', instrument: bass.id };
    s.customNotes = [...DEFAULT_CUSTOM_NOTES];
    s.customNotes[7] = 67;
    expect(fingerMidiOf(7, 0, s)).toBe(67);
    expect(fingerMidiOf(7, 3, s)).toBe(67);
    expect(fingerChordOf(7, -2, s)).toEqual([67]);
    expect(fingerChordOf(7, 0, { ...s, chord: 'triad' })).toEqual([67, 71, 74]);
  });

  it('Copiar da escala: as notas que se ouvem no modo Escala, com o registo', () => {
    const bass = SAMPLED.find((x) => x.register !== 0)!;
    const s: NoteSettings = {
      ...base,
      instrument: bass.id,
      tonicAt: 'left-pinky',
      customNotes: Array(10).fill(70),
    };
    const out = notesFromScale(s);
    for (const i of [1, 2, 3, 4, 6, 7, 8, 9]) expect(out[i]).toBe(fingerMidiOf(i, 0, s));
    expect(out[4]).toBe(60 + 12 * bass.register);
    // polegares desligados ficam como estavam
    expect(out[0]).toBe(70);
    expect(out[5]).toBe(70);
    expect(notesFromScale({ ...s, thumbs: true })[5]).toBe(
      fingerMidiOf(5, 0, { ...s, thumbs: true }),
    );
  });

  it('normaliza notas guardadas', () => {
    expect(normalizeCustomNotes(undefined)).toEqual([...DEFAULT_CUSTOM_NOTES]);
    expect(normalizeCustomNotes([10, 60.4, 200])).toEqual([
      24,
      60,
      107,
      ...DEFAULT_CUSTOM_NOTES.slice(3),
    ]);
  });
});
