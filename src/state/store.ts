import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChordMode, ScaleName } from '../audio/theory';
import { migratePrefs } from '../ui/shell/logic';
import type { RecordingMeta } from './recordingsDb';
import type {
  Calibration,
  DrawerId,
  Engine,
  LoopBars,
  MouthFxId,
  Quantize,
  ThemeName,
} from './types';

/** Preferências que se guardam em localStorage e entram nos presets. */
export interface SoundSettings {
  instrument: string;
  root: number;
  scale: ScaleName;
  octave: number;
  reverb: number; // 0..1
  echo: number; // 0..1
  pitch: number; // semitons, -12..12
  filter: number; // 0..1 (1 = aberto)
  drive: number; // 0..1
  mouthFx: MouthFxId;
  bpm: number;
  quantize: Quantize;
  chord: ChordMode;
}

export interface Prefs extends SoundSettings {
  sensitivity: number; // 0..1
  thumbs: boolean;
  heightPitch: boolean;
  glide: boolean;
  recentInstruments: string[];
  volume: number;
  muted: boolean;
  cameraId: string | null;
  lowRes: boolean;
  theme: ThemeName;
  metronome: boolean;
  recordVideo: boolean;
  loopBars: LoopBars;
  loopFreeze: boolean;
  calibration: Calibration | null;
  userPresets: Record<string, SoundSettings>;
}

export interface Runtime {
  started: boolean;
  engine: Engine;
  status: string;
  familyFilter: string;
  lastNote: string;
  recording: boolean;
  recordStart: number;
  settingsOpen: boolean;
  drawer: DrawerId | null;
  uiHidden: boolean;
  engineOpen: boolean;
  faceState: 'waiting' | 'ok' | 'unavailable';
  looper: { state: 'idle' | 'armed' | 'recording' | 'playing'; layers: number; bar: number };
  calibrating: string | null;
  lastRecordingId: string | null;
  videoSize: { w: number; h: number } | null;
  recordings: RecordingMeta[];
  /** Estado do carregamento das amostras por instrumento (sem `idle`). */
  sampleStatus: Record<string, 'loading' | 'ready' | 'error'>;
}

export type Store = Prefs &
  Runtime & {
    set: (p: Partial<Prefs & Runtime>) => void;
  };

export const DEFAULT_SOUND: SoundSettings = {
  instrument: 'piano',
  root: 0,
  scale: 'Pentatónica',
  octave: 4,
  reverb: 0.3,
  echo: 0.15,
  pitch: 0,
  filter: 1,
  drive: 0,
  mouthFx: 'wah',
  bpm: 120,
  quantize: 'off',
  chord: 'off',
};

export const DEFAULT_PREFS: Prefs = {
  ...DEFAULT_SOUND,
  sensitivity: 0.55,
  thumbs: false,
  heightPitch: true,
  glide: true,
  recentInstruments: [],
  volume: 0.75,
  muted: false,
  cameraId: null,
  lowRes: false,
  theme: 'dark',
  metronome: false,
  recordVideo: false,
  loopBars: 2,
  loopFreeze: false,
  calibration: null,
  userPresets: {},
};

const PREF_KEYS = Object.keys(DEFAULT_PREFS) as (keyof Prefs)[];

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFS,
      started: false,
      engine: 'none',
      status: '',
      familyFilter: 'Todos',
      lastNote: '—',
      recording: false,
      recordStart: 0,
      settingsOpen: false,
      drawer: null,
      uiHidden: false,
      engineOpen: false,
      faceState: 'waiting',
      looper: { state: 'idle', layers: 0, bar: 0 },
      calibrating: null,
      lastRecordingId: null,
      videoSize: null,
      recordings: [],
      sampleStatus: {},
      set: (p) => set(p),
    }),
    {
      name: 'vision-sound-cam:prefs',
      version: 3,
      migrate: (old, version) => migratePrefs(old, version) as unknown as Store,
      partialize: (s) => Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as Partial<Store>,
    },
  ),
);

export const getState = useStore.getState;
export const setState = (p: Partial<Prefs & Runtime>) => useStore.getState().set(p);
