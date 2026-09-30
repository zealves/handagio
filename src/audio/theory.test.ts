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

import { customChord } from './theory';
describe('acordes do modo Personalizado', () => {
  it('intervalos fixos sobre a nota exata', () => {
    expect(customChord(62, 'off')).toEqual([62]);
    expect(customChord(62, 'triad')).toEqual([62, 66, 69]);
    expect(customChord(62, 'seventh')).toEqual([62, 66, 69, 72]);
    expect(customChord(62, 'power')).toEqual([62, 69, 74]);
  });
  it('nomes: maior, sétima dominante e quinta', () => {
    expect(chordName(customChord(67, 'triad'))).toBe('Sol');
    expect(chordName(customChord(67, 'seventh'))).toBe('Sol 7');
    expect(chordName(customChord(67, 'power'))).toBe('Sol 5');
  });
});

import { CHORD_MODES, validChord } from './theory';
describe('formas de tocar novas', () => {
  const t = { root: 0, scale: 'Maior' as const, octave: 4 };
  const DO = 0; // grau do Dó
  const FA = 3; // grau do Fá
  it('ordem: da mais simples à mais rica', () => {
    expect(CHORD_MODES.map((m) => m.id)).toEqual([
      'off',
      'octave',
      'power',
      'triad',
      'sus4',
      'seventh',
      'ninth',
    ]);
    expect(CHORD_MODES.map((m) => m.label)).toEqual([
      'Uma nota',
      'Oitava',
      'Quinta',
      'Acorde',
      'Suspenso',
      'Sétima',
      'Nona',
    ]);
  });
  it('Oitava: a nota e a mesma 12 meios-tons acima', () => {
    expect(chordMidis(DO, t, 'octave')).toEqual([60, 72]);
    expect(chordMidis(FA, t, 'octave')).toEqual([65, 77]);
    expect(customChord(62, 'octave')).toEqual([62, 74]);
  });
  it('Suspenso: graus +0 +3 +4; no Fá de Dó maior a 4.ª fica aumentada (Si)', () => {
    expect(chordMidis(DO, t, 'sus4')).toEqual([60, 65, 67]); // Dó Fá Sol
    expect(chordMidis(FA, t, 'sus4')).toEqual([65, 71, 72]); // Fá Si Dó
    expect(customChord(62, 'sus4')).toEqual([62, 67, 69]);
  });
  it('Nona: graus +0 +2 +4 +6 +8', () => {
    expect(chordMidis(DO, t, 'ninth')).toEqual([60, 64, 67, 71, 74]); // Dó 7M(9)
    expect(chordMidis(FA, t, 'ninth')).toEqual([65, 69, 72, 76, 79]); // Fá 7M(9)
    expect(chordMidis(4, t, 'ninth')).toEqual([67, 71, 74, 77, 81]); // Sol 9
    expect(customChord(60, 'ninth')).toEqual([60, 64, 67, 70, 74]);
  });
  it('nomes', () => {
    expect(chordName([60, 72], 'octave')).toBe('Dó');
    expect(chordName([60, 72])).toBe('Dó');
    expect(chordName([60, 65, 67], 'sus4')).toBe('Dó sus4');
    expect(chordName(chordMidis(FA, t, 'sus4'), 'sus4')).toBe('Fá sus♯4');
    expect(chordName(chordMidis(6, t, 'sus4'), 'sus4')).toBe('Si sus4♭5');
    // Pentatónica: a "4.ª" da escala cai na 5.ª (Dó Sol Lá), não é uma quinta ("Dó 5")
    const penta = { root: 0, scale: 'Pentatónica' as const, octave: 4 };
    expect(chordMidis(DO, penta, 'sus4')).toEqual([60, 67, 69]);
    expect(chordName(chordMidis(DO, penta, 'sus4'), 'sus4')).toBe('Dó sus(5,6)');
    expect(chordName(chordMidis(1, penta, 'sus4'), 'sus4')).toBe('Ré sus(5,♭7)');
    // sem o modo, [0, 7, 12] continua a ser a quinta
    expect(chordName([60, 67, 72])).toBe('Dó 5');
    expect(chordName(customChord(60, 'ninth'), 'ninth')).toBe('Dó 9');
    expect(chordName(chordMidis(4, t, 'ninth'))).toBe('Sol 9');
    expect(chordName(chordMidis(1, t, 'ninth'))).toBe('Ré m9');
    expect(chordName(chordMidis(DO, t, 'ninth'))).toBe('Dó 7M(9)');
    expect(chordName(chordMidis(2, t, 'ninth'))).toBe('Mi m7(♭9)');
  });
  it('um id desconhecido passa a Uma nota', () => {
    expect(validChord('ninth')).toBe('ninth');
    expect(validChord('eleventh')).toBe('off');
    expect(validChord(undefined)).toBe('off');
    expect(validChord(3)).toBe('off');
  });
});
