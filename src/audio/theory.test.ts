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
