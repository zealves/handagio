import { describe, expect, it } from 'vitest';
import { alternateHands, enforceMinGap, minGapStepsExact, spaceLanes } from './generator';
import { NEON, NIGHT, SONG_BAR, SONG_TOP_DEGREE, type Song } from './songs';

const SONGS: [string, Song, number][] = [
  ['NIGHT', NIGHT, 90],
  ['NEON', NEON, 112],
];
const LANES = 8;
const SPLIT = 4;
const BEAT = 4;

/** Nota mais forte do compasso: a mais longa (em empate, a primeira). */
const strongOf = (s: Song, bar: number) =>
  s.melody
    .filter((n) => Math.floor(n.step / SONG_BAR) === bar)
    .reduce<Song['melody'][number] | null>((best, n) => (!best || n.dur > best.dur ? n : best), null);

describe.each(SONGS)('música %s', (_, song, bpm) => {
  it('graus em 0..7, passos dentro da música, um acorde por compasso, ordenada', () => {
    expect(song.chords).toHaveLength(song.bars);
    song.melody.forEach((n, k) => {
      expect(n.degree).toBeGreaterThanOrEqual(0);
      expect(n.degree).toBeLessThanOrEqual(SONG_TOP_DEGREE);
      expect(n.step).toBeGreaterThanOrEqual(0);
      expect(n.step).toBeLessThan(song.bars * SONG_BAR);
      expect(n.step % 2).toBe(0); // sem semicolcheias
      expect(n.dur).toBeGreaterThan(0);
      if (k > 0) expect(n.step).toBeGreaterThan(song.melody[k - 1].step);
      // a nota não se sobrepõe à seguinte
      if (k + 1 < song.melody.length) expect(n.step + n.dur).toBeLessThanOrEqual(song.melody[k + 1].step);
    });
    for (const b of song.bass) {
      expect(b.step).toBeGreaterThanOrEqual(0);
      expect(b.step).toBeLessThan(song.bars * SONG_BAR);
    }
    for (const h of [...song.drums.verse, ...song.drums.chorus]) {
      expect(h.step).toBeGreaterThanOrEqual(0);
      expect(h.step).toBeLessThan(SONG_BAR);
    }
    for (const b of song.drums.chorusBars) expect(b).toBeLessThan(song.bars);
  });

  it('o baixo nunca passa da oitava da tónica (tocado 2 oitavas abaixo da melodia, ≤ Lá3 no Néon)', () => {
    for (const b of song.bass) {
      expect(b.degree).toBeLessThanOrEqual(SONG_TOP_DEGREE);
      expect(b.degree).toBeGreaterThanOrEqual(-SONG_TOP_DEGREE);
    }
  });

  it('no máximo 2 colcheias seguidas', () => {
    let run = 0;
    song.melody.forEach((n, k) => {
      const next = song.melody[k + 1];
      run = next && next.step - n.step < BEAT ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(2);
    });
  });

  it('mapeada para 8 faixas (split 4), as regras do gerador não mexem em nenhuma nota', () => {
    const onsets = song.melody.map((n) => ({ step: n.step, lane: n.degree }));
    const out = spaceLanes(
      enforceMinGap(alternateHands(onsets, SPLIT, LANES), minGapStepsExact(bpm), SPLIT, LANES, 0),
      LANES,
    );
    expect(out).toEqual(onsets);
  });

  it('acaba na tónica, no início do último compasso', () => {
    const last = song.melody[song.melody.length - 1];
    expect(last.step).toBe((song.bars - 1) * SONG_BAR);
    expect(last.degree % 7).toBe(0);
  });

  it('a nota forte de cada compasso pertence à tríade do acorde em pelo menos 75% dos compassos', () => {
    let ok = 0;
    for (let bar = 0; bar < song.bars; bar++) {
      const n = strongOf(song, bar);
      const c = song.chords[bar];
      if (n && [c, c + 2, c + 4].map((d) => d % 7).includes(n.degree % 7)) ok++;
    }
    expect(ok / song.bars).toBeGreaterThanOrEqual(0.75);
  });
});
