// Catálogo único de instrumentos: 26 patches melódicos + 3 kits de percussão.
import { DRUM_KITS, DRUMS } from './drums';
import { PATCH_LIST, PATCHES } from './patches';
import type { Family } from './patches/types';

export type InstrumentKind = 'melodic' | 'continuous' | 'drum';

export interface InstrumentInfo {
  id: string;
  name: string;
  family: Family;
  desc: string;
  kind: InstrumentKind;
  sustain: boolean;
}

export const INSTRUMENTS: InstrumentInfo[] = [
  ...PATCH_LIST.map((p) => ({
    id: p.id,
    name: p.name,
    family: p.family,
    desc: p.desc,
    kind: (p.continuous ? 'continuous' : 'melodic') as InstrumentKind,
    sustain: !!p.sustain,
  })),
  ...DRUM_KITS.map((k) => ({
    id: k.id,
    name: k.name,
    family: 'Percussão' as Family,
    desc: k.desc,
    kind: 'drum' as InstrumentKind,
    sustain: false,
  })),
];

export const INSTRUMENT_BY_ID: Record<string, InstrumentInfo> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
);

export const instrumentInfo = (id: string): InstrumentInfo =>
  INSTRUMENT_BY_ID[id] ?? INSTRUMENT_BY_ID.piano;

export { PATCHES, DRUMS };
