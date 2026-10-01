// Textos dos dados pela língua atual, a partir do id (que nunca muda nas preferências nem nos
// presets). Sem tradução para um id (por exemplo, um instrumento novo), fica o texto em português.
import { DRUMS, INSTRUMENT_BY_ID } from '../audio/instruments';
import type { Family } from '../audio/patches/types';
import { CHORD_MODES, chordName, noteName, type ChordMode, type ScaleName } from '../audio/theory';
import type { NoteSrc } from '../state/types';
import { MOUTH_FX, type MouthFxId } from '../state/types';
import { t } from './index';

export function instrumentText(id: string): { name: string; desc: string } {
  const pt = INSTRUMENT_BY_ID[id];
  return t().data.instruments[id] ?? { name: pt?.name ?? id, desc: pt?.desc ?? '' };
}

export const familyLabel = (f: Family | string): string => t().data.families[f] ?? f;
export const scaleLabel = (s: ScaleName): string => t().data.scales[s] ?? s;
export const scaleGroupLabel = (g: string): string => t().data.scaleGroups[g] ?? g;

export function chordText(mode: ChordMode): {
  label: string;
  short: string;
  desc: string;
  custom: string;
} {
  const pt = CHORD_MODES.find((c) => c.id === mode)!;
  return (
    t().data.chords[mode] ?? { label: pt.label, short: pt.label, desc: pt.desc, custom: pt.desc }
  );
}

export function mouthText(id: MouthFxId): { label: string; desc: string } {
  const pt = MOUTH_FX.find((m) => m.id === id)!;
  return t().data.mouth[id] ?? { label: pt.label, desc: pt.desc };
}

export const padLabels = (kit: string): string[] =>
  t().data.kits[kit] ?? [...(DRUMS[kit] ?? DRUMS.drums).labels];

/** Nome de um som guardado: os de fábrica traduzidos; os do utilizador como lhes deu. */
export const presetLabel = (name: string): string => t().data.presets[name] ?? name;

export const cameraError = (code: string): string =>
  t().camera.errors[code] ?? t().camera.unknown(code);

/** "E Indicador" / "L index": a mão e o dedo (índices 0..4 esquerda, 5..9 direita). */
export function fingerName(i: number): string {
  const d = t().data;
  return `${i < 5 ? d.hands.left : d.hands.right} ${d.fingers[i % 5]}`;
}

/** A última nota na língua atual (ver `noteSrc`); sem origem (ou sem nota, "—"), o texto guardado. */
export function noteText(src: NoteSrc | null, fallback: string): string {
  if (!src || fallback === '—') return fallback;
  if ('kit' in src) return padLabels(src.kit)[src.slot] ?? fallback;
  return src.midis.length > 1 ? chordName(src.midis, src.chord) : noteName(src.midis[0]);
}
