// Catálogo único de instrumentos: patches sintetizados + instrumentos com amostras gravadas +
// kits de percussão.
import type { ScaleName, Tuning } from './theory';
import { SAMPLED, SAMPLED_BY_ID } from './samples/catalog';
import { DRUM_KITS, DRUMS } from './drums';
import { PATCH_LIST, PATCHES } from './patches';
import { FAMILIES, type Family } from './patches/types';

export type InstrumentKind = 'melodic' | 'continuous' | 'drum';

export interface InstrumentInfo {
  id: string;
  name: string;
  family: Family;
  desc: string;
  kind: InstrumentKind;
  sustain: boolean;
  /** Toca amostras gravadas em vez de síntese pura. */
  sampled: boolean;
}

/** Patches sintetizados sem amostra dedicada (os restantes servem de reserva a `SAMPLED`). */
const PATCHES_ONLY = PATCH_LIST.filter((p) => !SAMPLED_BY_ID[p.id]);

export const INSTRUMENTS: InstrumentInfo[] = FAMILIES.flatMap((family): InstrumentInfo[] => {
  if (family === 'Percussão') {
    return DRUM_KITS.map((k) => ({
      id: k.id,
      name: k.name,
      family: 'Percussão' as Family,
      desc: k.desc,
      kind: 'drum' as InstrumentKind,
      sustain: false,
      sampled: false,
    }));
  }
  const sampled = SAMPLED.filter((s) => s.family === family).map((s): InstrumentInfo => ({
    id: s.id,
    name: s.name,
    family: s.family,
    desc: s.desc,
    kind: 'melodic',
    sustain: s.kind === 'sustained',
    sampled: true,
  }));
  const synth = PATCHES_ONLY.filter((p) => p.family === family).map((p): InstrumentInfo => ({
    id: p.id,
    name: p.name,
    family: p.family,
    desc: p.desc,
    kind: p.continuous ? 'continuous' : 'melodic',
    sustain: !!p.sustain,
    sampled: false,
  }));
  return [...sampled, ...synth];
});

export const INSTRUMENT_BY_ID: Record<string, InstrumentInfo> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
);

export const instrumentInfo = (id: string): InstrumentInfo =>
  INSTRUMENT_BY_ID[id] ?? INSTRUMENT_BY_ID.piano;

/** Afinação efetiva: a oitava escolhida, ajustada ao registo do instrumento com amostras. */
export const tuningOf = (s: {
  root: number;
  scale: ScaleName;
  octave: number;
  instrument: string;
}): Tuning => ({
  root: s.root,
  scale: s.scale,
  octave: s.octave + (SAMPLED_BY_ID[s.instrument]?.register ?? 0),
});

export { PATCHES, DRUMS };
export {
  SAMPLED,
  SAMPLED_BY_ID,
  isSampled,
  type SampledDef,
  type SampleKind,
} from './samples/catalog';
