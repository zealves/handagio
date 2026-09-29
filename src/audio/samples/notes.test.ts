import { describe, expect, it } from 'vitest';
import { nearestSample, noteToMidi, playbackRateFor, releaseTime } from './notes';

describe('noteToMidi', () => {
  it('lê naturais, sustenidos (s ou #) e bemóis', () => {
    expect(noteToMidi('A4')).toBe(69);
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('Cs5')).toBe(73);
    expect(noteToMidi('C#5')).toBe(73);
    expect(noteToMidi('Db3')).toBe(49);
    expect(noteToMidi('A0')).toBe(21);
  });
  it('rejeita nomes inválidos', () => {
    expect(() => noteToMidi('H2')).toThrow();
    expect(() => noteToMidi('C')).toThrow();
  });
});

describe('nearestSample', () => {
  const notes = [48, 55, 60, 67];
  it('escolhe a mais próxima; em empate a de baixo', () => {
    expect(nearestSample(61, notes)).toBe(60);
    expect(nearestSample(64, notes)).toBe(67);
    expect(nearestSample(51, notes)).toBe(48); // 51 está a 3 de 48 e a 4 de 55
    expect(nearestSample(63, [60, 66])).toBe(60); // empate
  });
  it('fora do intervalo usa o extremo', () => {
    expect(nearestSample(10, notes)).toBe(48);
    expect(nearestSample(120, notes)).toBe(67);
  });
});

describe('playbackRateFor', () => {
  it('uma oitava acima duplica', () => {
    expect(playbackRateFor(72, 60)).toBeCloseTo(2);
    expect(playbackRateFor(60, 60)).toBe(1);
    expect(playbackRateFor(59, 60)).toBeCloseTo(0.9439, 3);
  });
  it('limita a [0.25, 4]', () => {
    expect(playbackRateFor(120, 60)).toBe(4);
    expect(playbackRateFor(0, 60)).toBe(0.25);
  });
});

describe('releaseTime', () => {
  it('nunca antes de 250 ms depois do início', () => {
    expect(releaseTime(10.1, 10)).toBeCloseTo(10.25);
    expect(releaseTime(11, 10)).toBe(11);
    expect(releaseTime(10.1, 10, 0.05)).toBeCloseTo(10.1);
  });
});
