/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DRUM_KITS } from '../drums';
import { PATCHES } from '../patches';
import { SAMPLED, SAMPLED_BY_ID, isSampled } from './catalog';
import { noteToMidi } from './notes';

const manifestPath = fileURLToPath(
  new URL('../../../public/samples/manifest.json', import.meta.url),
);
const samplesDir = fileURLToPath(new URL('../../../public/samples/', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
  instruments: Record<string, { notes: Record<string, number> }>;
};

describe('SAMPLED ↔ manifest', () => {
  for (const s of SAMPLED) {
    describe(s.id, () => {
      it('existe no manifest com pelo menos 4 notas', () => {
        const entry = manifest.instruments[s.id];
        expect(entry).toBeDefined();
        expect(Object.keys(entry.notes).length).toBeGreaterThanOrEqual(4);
      });
      it('todas as notas têm nome válido e ficheiro em disco', () => {
        const entry = manifest.instruments[s.id];
        for (const note of Object.keys(entry.notes)) {
          expect(() => noteToMidi(note)).not.toThrow();
          expect(existsSync(`${samplesDir}${s.id}/${note}.mp3`)).toBe(true);
        }
      });
    });
  }
});

describe('SAMPLED ↔ patches de reserva', () => {
  it('cada fallback existe em PATCHES', () => {
    for (const s of SAMPLED) {
      expect(PATCHES[s.fallback], `fallback "${s.fallback}" de ${s.id}`).toBeDefined();
    }
  });
});

describe('level', () => {
  it('é um número finito entre −12 e 18 dB', () => {
    for (const s of SAMPLED) {
      expect(Number.isFinite(s.level), s.id).toBe(true);
      expect(s.level, s.id).toBeGreaterThanOrEqual(-12);
      expect(s.level, s.id).toBeLessThanOrEqual(18);
    }
  });
});

describe('ids', () => {
  it('são únicos', () => {
    expect(new Set(SAMPLED.map((s) => s.id)).size).toBe(SAMPLED.length);
  });
  it('não colidem com ids de percussão', () => {
    const drumIds = new Set(DRUM_KITS.map((k) => k.id));
    for (const s of SAMPLED) {
      expect(drumIds.has(s.id)).toBe(false);
    }
  });
  it('isSampled reflete o catálogo', () => {
    for (const s of SAMPLED) expect(isSampled(s.id)).toBe(true);
    expect(isSampled('nao-existe')).toBe(false);
  });
  it('SAMPLED_BY_ID indexa por id', () => {
    for (const s of SAMPLED) expect(SAMPLED_BY_ID[s.id]).toBe(s);
  });
});
