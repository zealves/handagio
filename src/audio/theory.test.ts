import { describe, expect, it } from 'vitest';
import { degreeToMidi, midiToFreq, noteName, freqToMidi } from './theory';

describe('theory', () => {
  const t = { root: 0, scale: 'Maior' as const, octave: 4 };
  it('converte graus em MIDI, incluindo negativos e oitavas', () => {
    expect(degreeToMidi(0, t)).toBe(60);
    expect(degreeToMidi(2, t)).toBe(64);
    expect(degreeToMidi(7, t)).toBe(72);
    expect(degreeToMidi(-1, t)).toBe(59);
  });
  it('respeita a tónica e a oitava', () => {
    expect(degreeToMidi(0, { root: 9, scale: 'Menor', octave: 3 })).toBe(57);
  });
  it('nomes das notas em português', () => {
    expect(noteName(60)).toBe('Dó4');
    expect(noteName(61)).toBe('Dó♯4');
    expect(noteName(69)).toBe('Lá4');
    expect(noteName(71)).toBe('Si4');
  });
  it('frequências', () => {
    expect(midiToFreq(69)).toBe(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
    expect(freqToMidi(440)).toBe(69);
  });
});

import { chordMidis, SCALE_GROUPS, SCALES } from './theory';

describe('escalas e acordes', () => {
  const t = { root: 0, scale: 'Maior' as const, octave: 4 };
  it('todas as escalas aparecem num grupo', () => {
    const inGroups = SCALE_GROUPS.flatMap((g) => g.scales).sort();
    expect(inGroups).toEqual(Object.keys(SCALES).sort());
  });
  it('menor harmónica tem a sétima maior', () => {
    expect(SCALES['Menor harmónica']).toEqual([0, 2, 3, 5, 7, 8, 11]);
  });
  it('tríades diatónicas em Dó maior', () => {
    expect(chordMidis(0, t, 'triad')).toEqual([60, 64, 67]); // Dó maior
    expect(chordMidis(1, t, 'triad')).toEqual([62, 65, 69]); // Ré menor
    expect(chordMidis(4, t, 'seventh')).toEqual([67, 71, 74, 77]); // Sol7
  });
  it('nota única e power chord', () => {
    expect(chordMidis(0, t, 'off')).toEqual([60]);
    expect(chordMidis(0, t, 'power')).toEqual([60, 67, 72]);
  });
});

import { chordName } from './theory';
describe('nomes dos acordes', () => {
  it('qualidades', () => {
    expect(chordName([60, 64, 67])).toBe('Dó');
    expect(chordName([62, 65, 69])).toBe('Ré m');
    expect(chordName([71, 74, 77])).toBe('Si dim');
    expect(chordName([67, 71, 74, 77])).toBe('Sol 7');
    expect(chordName([60, 64, 67, 71])).toBe('Dó 7M');
    expect(chordName([71, 74, 77, 81])).toBe('Si m7♭5');
    expect(chordName([71, 74, 77, 80])).toBe('Si dim7');
    expect(chordName([60, 67, 72])).toBe('Dó 5');
  });
});
