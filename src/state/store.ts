import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChordMode, ScaleName } from '../audio/theory';
import { DEFAULT_CUSTOM_NOTES, type NoteMode } from '../app/notes';
import { migratePrefs, sanitizePrefs } from '../ui/shell/logic';
import { DEFAULT_GAME_FINGERS, GAME_INPUT_LAG_MS } from '../game/config';
import { LEVELS, type LevelProgress } from '../game/levels';
import type { Difficulty } from '../game/types';
import type { LearnedRange } from '../vision/adaptive';
import type { TonicAt } from '../vision/fingerMap';
import type { Lang } from '../i18n/types';
import type { RecordingMeta } from './recordingsDb';
import type {
  Calibration,
  CoachId,
  Engine,
  GameUi,
  LoopBars,
  MouthFxId,
  NoteSrc,
  Quantize,
  SheetTab,
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
  /** Modo Escala: dedo onde fica a tónica. */
  tonicAt: TonicAt;
  /** Escala (graus a partir da tónica) ou Personalizado (uma nota exata por dedo). */
  noteMode: NoteMode;
  /** Modo Personalizado: nota MIDI de cada dedo (índices de `fingerMap`, 0..9). */
  customNotes: number[];
}

export interface Prefs extends SoundSettings {
  sensitivity: number; // 0..1
  /** Desloca o limiar dos polegares como `sensitivity` desloca o dos outros dedos. */
  thumbSensitivity: number; // 0..1
  thumbs: boolean;
  heightPitch: boolean;
  glide: boolean;
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
  /** Aprender o intervalo de cada dedo enquanto se toca (e usá-lo nos limiares). */
  learnHand: boolean;
  /** Intervalos de dobra aprendidos por dedo (10; null = nada aprendido). Fora dos presets. */
  learnedRanges: (LearnedRange | null)[] | null;
  userPresets: Record<string, SoundSettings>;
  /** Mostrar no HUD as imagens por segundo da deteção e o modo de deteção. */
  showFps: boolean;
  /** Dicas do primeiro uso já cumpridas (ou dispensadas). */
  coachDone: CoachId[];
  /** Língua da interface (a inicial vem de `detectLang`, em main.tsx). */
  lang: Lang;
  /** Modo de jogo: recorde (pontos) por dificuldade. Fora dos presets. */
  gameBest: Record<Difficulty, number>;
  /** Última dificuldade escolhida. */
  gameDifficulty: Difficulty;
  /** Atraso da câmara descontado aos toques (ms). */
  gameLagMs: number;
  /** Modo de jogo: dedos que jogam (pela ordem do ecrã). */
  gameFingers: number[];
  /** Modo de jogo: progresso de cada nível (estrelas, pontos e precisão), neste aparelho. */
  levelProgress: LevelProgress;
  /** Tab aberta no menu do jogo. */
  gameTab: 'levels' | 'practice';
  /** Último nível escolhido (ou o primeiro, por defeito). */
  gameLevel: string;
}

export interface Runtime {
  started: boolean;
  engine: Engine;
  status: string;
  familyFilter: string;
  lastNote: string;
  /**
   * De onde veio a última nota (notas MIDI e forma de tocar, ou o pad de um kit), para o HUD a
   * escrever na língua atual; `lastNote` fica com o texto do momento (dicas, testes).
   */
  noteSrc: NoteSrc | null;
  recording: boolean;
  recordStart: number;
  settingsOpen: boolean;
  /** Tab aberta na folha de configuração (null = fechada). */
  sheet: SheetTab | null;
  /** Última tab aberta: a folha volta a ela quando abre sem uma tab escolhida. */
  sheetTab: SheetTab;
  /** Tira "Cada dedo toca…" aberta (no telemóvel; nos ecrãs largos está sempre à vista). */
  chordStrip: boolean;
  /** Teclado tátil (piano ou pads) à vista no fundo do palco. */
  touchKeys: boolean;
  /** Erro ao abrir a câmara (o cartão do palco oferece tentar outra vez ou tocar no ecrã). */
  cameraError: string | null;
  /** A câmara e o detetor estão a arrancar (o HUD esconde "Ligar câmara" e as dicas esperam). */
  cameraStarting: boolean;
  /** Aviso breve por cima das pills (por exemplo, depois de gravar), com uma tab para "Ver". */
  notice: { text: string; tab?: SheetTab } | null;
  uiHidden: boolean;
  faceState: 'waiting' | 'ok' | 'unavailable';
  looper: { state: 'idle' | 'armed' | 'recording' | 'playing'; layers: number; bar: number };
  calibrating: string | null;
  lastRecordingId: string | null;
  recordings: RecordingMeta[];
  /** Estado do carregamento das amostras por instrumento (sem `idle`). */
  sampleStatus: Record<string, 'loading' | 'ready' | 'error'>;
  /** Modo de jogo: cartão de entrada, a jogar ou resultado (null = fora do jogo). */
  game: GameUi | null;
}

export type Store = Prefs &
  Runtime & {
    set: (p: Partial<Prefs & Runtime>) => void;
  };

export const DEFAULT_SOUND: SoundSettings = {
  instrument: 'piano',
  root: 0,
  scale: 'Maior',
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
  tonicAt: 'left-pinky',
  noteMode: 'scale',
  customNotes: [...DEFAULT_CUSTOM_NOTES],
};

export const DEFAULT_PREFS: Prefs = {
  ...DEFAULT_SOUND,
  sensitivity: 0.55,
  thumbSensitivity: 0.5,
  thumbs: false,
  heightPitch: false,
  glide: true,
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
  learnHand: true,
  learnedRanges: null,
  userPresets: {},
  showFps: false,
  coachDone: [],
  lang: 'pt',
  gameBest: { easy: 0, medium: 0, hard: 0 },
  gameDifficulty: 'easy',
  gameLagMs: GAME_INPUT_LAG_MS,
  gameFingers: [...DEFAULT_GAME_FINGERS],
  levelProgress: {},
  gameTab: 'levels',
  gameLevel: LEVELS[0].id,
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
      noteSrc: null,
      recording: false,
      recordStart: 0,
      settingsOpen: false,
      sheet: null,
      sheetTab: 'som',
      chordStrip: false,
      touchKeys: false,
      cameraError: null,
      cameraStarting: false,
      notice: null,
      uiHidden: false,
      faceState: 'waiting',
      looper: { state: 'idle', layers: 0, bar: 0 },
      calibrating: null,
      lastRecordingId: null,
      recordings: [],
      sampleStatus: {},
      game: null,
      set: (p) => set(p),
    }),
    {
      name: 'handagio:prefs',
      version: 9,
      migrate: (old, version) => migratePrefs(old, version) as unknown as Store,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizePrefs((persisted ?? {}) as Record<string, unknown>),
      }),
      partialize: (s) => Object.fromEntries(PREF_KEYS.map((k) => [k, s[k]])) as Partial<Store>,
    },
  ),
);

export const getState = useStore.getState;
export const setState = (p: Partial<Prefs & Runtime>) => useStore.getState().set(p);
