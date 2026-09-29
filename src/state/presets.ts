// Predefinições: 4 de fábrica e as do utilizador (guardadas em localStorage com as preferências).
import { normalizeCustomNotes } from '../app/notes';
import { DEFAULT_SOUND, type SoundSettings } from './store';

export const FACTORY_PRESETS: Record<string, SoundSettings> = {
  'Piano calmo': {
    ...DEFAULT_SOUND,
    instrument: 'piano',
    root: 0,
    scale: 'Maior',
    octave: 4,
    reverb: 0.55,
    echo: 0.2,
    pitch: 0,
    filter: 0.85,
    drive: 0,
    mouthFx: 'filter',
    bpm: 76,
    quantize: 'off',
  },
  'Batida 808': {
    ...DEFAULT_SOUND,
    instrument: 'tr808',
    scale: 'Pentatónica',
    reverb: 0.12,
    echo: 0.05,
    pitch: 0,
    filter: 1,
    drive: 0.25,
    mouthFx: 'dist',
    bpm: 96,
    quantize: '1/16',
  },
  'Theremin espacial': {
    ...DEFAULT_SOUND,
    instrument: 'theremin',
    root: 9,
    scale: 'Pentatónica menor',
    octave: 4,
    reverb: 0.75,
    echo: 0.5,
    pitch: 0,
    filter: 0.9,
    drive: 0,
    mouthFx: 'echo',
    bpm: 90,
    quantize: 'off',
  },
  'Coro etéreo': {
    ...DEFAULT_SOUND,
    instrument: 'choir',
    root: 2,
    scale: 'Dórica',
    octave: 4,
    reverb: 0.85,
    echo: 0.3,
    pitch: 0,
    filter: 0.8,
    drive: 0,
    mouthFx: 'vibrato',
    bpm: 70,
    quantize: 'off',
  },
};

const KEYS = Object.keys(DEFAULT_SOUND) as (keyof SoundSettings)[];

/** Extrai só os campos de som (o que entra num preset). */
export function pickSound(s: SoundSettings): SoundSettings {
  return Object.fromEntries(KEYS.map((k) => [k, s[k]])) as unknown as SoundSettings;
}

/** Aplica um preset guardado, completando campos em falta (presets de versões antigas). */
export const completePreset = (p: Partial<SoundSettings>): SoundSettings => ({
  ...DEFAULT_SOUND,
  ...p,
  customNotes: normalizeCustomNotes(p.customNotes),
});
