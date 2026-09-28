import { describe, expect, it } from 'vitest';
import { DRUM_KITS } from './drums';
import { INSTRUMENTS } from './instruments';
import { PATCH_LIST } from './patches';

describe('catálogo de instrumentos', () => {
  it('26 patches melódicos e 3 kits (29 no total)', () => {
    expect(PATCH_LIST).toHaveLength(26);
    expect(DRUM_KITS).toHaveLength(3);
    expect(INSTRUMENTS).toHaveLength(29);
  });
  it('ids únicos', () => {
    expect(new Set(INSTRUMENTS.map((i) => i.id)).size).toBe(29);
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
    expect(fam('Cordas')).toBe(5);
    expect(fam('Sopros')).toBe(4);
    expect(fam('Lâminas')).toBe(6);
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
});
