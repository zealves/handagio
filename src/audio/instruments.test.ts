import { describe, expect, it } from 'vitest';
import { DRUM_KITS } from './drums';
import { INSTRUMENTS, tuningOf } from './instruments';
import { PATCH_LIST } from './patches';
import { FAMILIES, type Family } from './patches/types';
import { SAMPLED } from './samples/catalog';

describe('catálogo de instrumentos', () => {
  it('26 patches sintetizados, 18 com amostras e 3 kits (38 no total)', () => {
    expect(PATCH_LIST).toHaveLength(26);
    expect(DRUM_KITS).toHaveLength(3);
    expect(INSTRUMENTS).toHaveLength(38);
  });
  it('ids únicos', () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(38);
  });
  it('cada kit tem 10 sons e 10 nomes', () => {
    for (const k of DRUM_KITS) {
      expect(k.sounds).toHaveLength(10);
      expect(k.labels).toHaveLength(10);
    }
  });
  it('famílias', () => {
    const fam = (f: string) => INSTRUMENTS.filter((i) => i.family === f).length;
    expect(fam('Teclas')).toBe(5);
    expect(fam('Cordas')).toBe(8);
    expect(fam('Sopros')).toBe(9);
    expect(fam('Lâminas')).toBe(7);
    expect(fam('Sintetizadores')).toBe(6);
    expect(fam('Percussão')).toBe(3);
  });
  it('sustentados declaram rel; one-shots declaram len', () => {
    for (const p of PATCH_LIST) {
      if (p.continuous) continue;
      if (p.sustain) expect(p.rel).toBeGreaterThan(0);
      else expect(p.len).toBeGreaterThan(0);
    }
  });
  it('marca sampled: true só para os ids de SAMPLED', () => {
    const sampledIds = new Set(SAMPLED.map((s) => s.id));
    for (const i of INSTRUMENTS) {
      expect(i.sampled).toBe(sampledIds.has(i.id));
    }
  });
  it('segue a ordem de FAMILIES, com as amostras primeiro em cada família', () => {
    const order = INSTRUMENTS.map((i) => FAMILIES.indexOf(i.family));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const byFamily = (f: Family) => INSTRUMENTS.filter((i) => i.family === f);
    for (const f of FAMILIES) {
      const items = byFamily(f);
      const firstSynth = items.findIndex((i) => !i.sampled);
      if (firstSynth === -1) continue;
      expect(items.slice(0, firstSynth).every((i) => i.sampled)).toBe(true);
    }
  });
});

describe('tuningOf', () => {
  it('soma o registo do instrumento à oitava escolhida', () => {
    expect(tuningOf({ root: 0, scale: 'Maior', octave: 4, instrument: 'cello' })).toEqual({
      root: 0,
      scale: 'Maior',
      octave: 3,
    });
    expect(tuningOf({ root: 0, scale: 'Maior', octave: 4, instrument: 'synth' })).toEqual({
      root: 0,
      scale: 'Maior',
      octave: 4,
    });
  });
});
