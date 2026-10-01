// Orquestrador (sem React): câmara → visão → gestos → áudio. Corre o seu próprio ciclo rAF,
// separado do render da interface.
import { audio } from '../audio/engine';
import { DRUMS, instrumentInfo, isSampled } from '../audio/instruments';
import { t } from '../i18n';
import { cameraError, padLabels } from '../i18n/data';
import { samples } from '../audio/samples/loader';
import { Looper, type LoopEvent } from '../audio/looper';
import { Clock, quantizeTime, STEPS_PER_BAR, STEPS_PER_BEAT, TapTempo } from '../audio/metronome';
import { clamp, noteName, chordName } from '../audio/theory';
import { live, pushBurst } from '../state/live';
import { getState, setState, useStore, type Store } from '../state/store';
import { CAMERA_SIZE, CameraError, listCameras, openCamera, stopStream } from '../vision/camera';
import { isActive, KEYMAP, slotOf } from '../vision/fingerMap';
import { aspectOf, GestureEngine, type GestureOptions } from '../vision/gestureEngine';
import { CalibrationCollector, type CalPhase } from '../vision/calibration';
import { curls } from '../vision/fingerCurl';
import { FaceTracker, mouthOpenness } from '../vision/faceTracker';
import {
  assignHands,
  createHandAssignState,
  HandTracker,
  type Handedness,
} from '../vision/handTracker';
import { MotionDetector } from '../vision/motionFallback';
import type { Pt } from '../vision/types';
import { FINGER_COLORS } from '../ui/theme';
import { isTypingTarget } from '../lib/keys';
import { fingerChordOf, fingerMidiOf } from './notes';

const NO_RESULT_MS = 6000;
/**
 * Boca: a face corre no máximo 1 vez em cada `FACE_EVERY` fotogramas de vídeo, num tick do rAF
 * sem fotograma novo (o das mãos fica sozinho no seu tick). Ao fim de `FACE_MAX_GAP` fotogramas
 * sem nenhum tick livre (ecrã a 30 Hz, ou câmara a 60 fps), corre depois das mãos.
 */
const FACE_EVERY = 2;
const FACE_MAX_GAP = 3;
/** Intervalo mínimo (ms) entre gravações dos intervalos aprendidos nas preferências. */
const LEARN_SAVE_MS = 5000;
const LOAD_TIMEOUT_MS = 20000;
/** Espera depois de escolher um instrumento antes de carregar as amostras. */
const SAMPLE_LOAD_DELAY_MS = 300;
const KEY_VELOCITY = 0.75;
/** Duração da pré-escuta de uma nota escolhida no editor do modo Personalizado. */
const PREVIEW_MS = 450;
/** Nível contínuo equivalente ao ganho 0.16 que o protótipo usava no modo teclado. */
const KEY_CONT_LEVEL = Math.sqrt(0.16 / 0.18);

const fingerPan = (i: number) => (i - 4.5) / 6;
/** Chave da voz: o dedo (nota única ou fundamental) ou `dedo:k` para as outras notas do acorde. */
const voiceKey = (i: number, k: number): number | string => (k ? `${i}:${k}` : i);
/** Nos acordes, as vozes extra soam mais baixo para não saturar; na Nona (5 vozes) ainda mais. */
const extraVoiceGain = (n: number): number => (n >= 5 ? 0.55 : 0.7);

class Session {
  video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  readonly gesture = new GestureEngine(live.fingers);
  private motion: MotionDetector | null = null;
  private hands = new HandTracker();
  /** Lados das mãos entre fotogramas (orientação dos rótulos aprendida e último pulso). */
  private handState = createHandAssignState();
  private face = new FaceTracker();
  /** Fotogramas de vídeo novos desde a última deteção da face. */
  private faceGap = 0;
  private detections = 0;
  /** Diagnóstico (`__vsc.session.stats`): chamadas ao detetor das mãos e ao da face. */
  readonly stats = { handDetects: 0, faceDetects: 0 };
  /** Aprendizagem: versão do `adaptive` já gravada e quando. */
  private learnSaved = 0;
  private learnSavedT = 0;
  /** Último `learnedRanges` escrito pela sessão (para distinguir de um "Repor"). */
  private learnWritten: unknown = undefined;
  private raf = 0;
  private lastT = 0;
  private lastProcT = 0;
  private lastVideoTime = -1;
  private fpsCount = 0;
  private fpsT = 0;
  /** A câmara está a abrir, ou já abriu (o arranque só volta a correr depois de ela falhar). */
  private cameraBusy = false;
  /** Carregamento das amostras adiado depois de mudar de instrumento (percorrer com , e .). */
  private sampleTimer: ReturnType<typeof setTimeout> | null = null;
  private keysDown = new Set<string>();
  /** Nota MIDI a soar em cada dedo (para apagar a tecla certa no noteOff). */
  private fingerNote: (number[] | null)[] = new Array(10).fill(null);
  readonly clock = new Clock({
    now: () => audio.now,
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
  });
  readonly looper = new Looper();
  private tapper = new TapTempo();
  private loopSeq = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private cal: { collector: CalibrationCollector; phase: CalPhase } | null = null;
  /** Diagnóstico: pára a deteção real para se poderem injetar mãos com `feedHands`. */
  detectionPaused = false;

  constructor() {
    this.gesture.on('noteOn', ({ finger, velocity, shift }) =>
      this.fingerOn(finger, velocity, shift),
    );
    this.gesture.on('noteOff', ({ finger }) => this.fingerOff(finger));
    this.gesture.on('glide', ({ finger, pitch }) => {
      // `pitch` é o desvio em meios-tons em relação à nota tocada (já com a altura e o acorde)
      this.fingerNote[finger]?.forEach((m, k) => audio.glide(voiceKey(finger, k), m + pitch));
    });
    this.gesture.on('continuous', ({ finger, level, pitch }) =>
      this.fingerContinuous(finger, level, pitch),
    );
    this.clock.on('step', ({ step, time }) => this.onStep(step, time));
  }

  attachVideo(v: HTMLVideoElement | null): void {
    this.video = v;
    if (v && this.stream && v.srcObject !== this.stream) v.srcObject = this.stream;
  }

  gestureOptions(): GestureOptions {
    const s = getState();
    // no modo Personalizado as notas são exatas: a altura da mão não as escolhe (o arrastar
    // continua, a partir da nota do dedo)
    const custom = s.noteMode === 'custom';
    return {
      sensitivity: s.sensitivity,
      thumbSensitivity: s.thumbSensitivity,
      thumbs: s.thumbs,
      heightPitch: s.heightPitch && !custom,
      glide: s.glide,
      continuous: instrumentInfo(s.instrument).kind === 'continuous',
      calibration: s.calibration,
      learn: s.learnHand,
      // o polegar mede-se em unidades quadradas (ver `palmCoords`)
      videoW: live.videoW,
      videoH: live.videoH,
    };
  }

  /** Nota MIDI de um dedo com o deslocamento em graus (ignorado no modo Personalizado). */
  fingerMidi(i: number, shift: number): number {
    return fingerMidiOf(i, shift, getState());
  }

  // ---------- áudio ----------
  /** Cria/retoma o AudioContext (só depois de um gesto do utilizador). */
  ensureAudio(): void {
    const first = !audio.ready;
    audio.init();
    void audio.resume();
    if (first) {
      this.syncParams(getState());
      this.clock.setBpm(getState().bpm);
      this.clock.start();
      this.loadSamples(getState().instrument);
    }
  }

  /** Carrega (ou volta a tentar carregar) as amostras de um instrumento em segundo plano. */
  loadSamples(id: string): void {
    if (audio.ready && isSampled(id)) void samples.load(audio.ctx, id);
  }

  private syncParams(s: Store): void {
    audio.setParams({
      volume: s.volume,
      muted: s.muted,
      reverb: s.reverb,
      echo: s.echo,
      filter: s.filter,
      drive: s.drive,
      pitch: s.pitch,
    });
  }

  // ---------- disparos ----------
  /** Disparo de um dedo (câmara, modo movimento ou teclado). */
  fingerOn(i: number, velocity: number, shift: number): void {
    const s = getState();
    if (!audio.ready || !isActive(i, s.thumbs) || this.cal) return;
    const info = instrumentInfo(s.instrument);
    const fx = live.fx[i];
    fx.flash = 1;
    const when = quantizeTime(audio.now, this.clock.anchor, this.clock.bpm, s.quantize);
    if (info.kind === 'drum') {
      const slot = slotOf(i, s.thumbs);
      this.playDrum(slot, velocity, i, when);
      fx.label = padLabels(info.id)[slot];
      return;
    }
    if (info.kind === 'continuous') return;
    const midis = fingerChordOf(i, shift, s);
    const midi = midis[0];
    fx.midi = midi;
    fx.label = midis.length > 1 ? chordName(midis, s.chord) : noteName(midi);
    this.releaseFingerNote(i);
    this.fingerNote[i] = midis;
    const extra = extraVoiceGain(midis.length);
    midis.forEach((m, k) =>
      this.playNote(
        voiceKey(i, k),
        m,
        velocity * (k ? extra : 1),
        fingerPan(i),
        FINGER_COLORS[i],
        info.sustain,
        when,
      ),
    );
    if (midis.length > 1) setState({ lastNote: fx.label, noteSrc: { midis, chord: s.chord } });
    const tip = live.fingers[i].tip;
    pushBurst({
      x: tip?.x ?? (i + 0.5) / 10,
      y: tip?.y ?? 0.6,
      color: FINGER_COLORS[i],
      strength: velocity,
    });
  }

  fingerOff(i: number): void {
    const n = this.fingerNote[i]?.length ?? 1;
    for (let k = 0; k < n; k++) {
      audio.noteOff(voiceKey(i, k));
      this.looper.release(this.clock.positionAt(audio.now), String(voiceKey(i, k)));
    }
    this.releaseFingerNote(i);
  }

  private releaseFingerNote(i: number): void {
    const ms = this.fingerNote[i];
    if (!ms) return;
    for (const m of ms) {
      const n = live.notes.get(m);
      if (n) n.held = false;
    }
    this.fingerNote[i] = null;
  }

  fingerContinuous(i: number, level: number, pitch: number): void {
    if (!audio.ready) return;
    const m = this.fingerMidi(i, 0) + pitch;
    audio.continuous(i, m, level);
    const fx = live.fx[i];
    fx.flash = Math.max(fx.flash, level);
    fx.midi = m;
    fx.label = noteName(m);
    if (level > 0.05) {
      live.notes.set(Math.round(m), {
        level: Math.max(level, 0.3),
        color: FINGER_COLORS[i],
        held: false,
      });
      setState({ lastNote: fx.label, noteSrc: { midis: [m] } });
    }
  }

  /** Toca uma nota melódica numa voz identificada por `key` (e grava-a no looper, se `record`). */
  playNote(
    key: number | string,
    midi: number,
    vel: number,
    pan: number,
    color: string,
    held: boolean,
    when?: number,
    record = true,
  ): void {
    const s = getState();
    audio.noteOn(key, s.instrument, midi, vel, pan, when);
    this.at(when, () => {
      // se a nota já foi solta antes de soar (quantização), a luz não fica presa
      live.notes.set(midi, { level: 1, color, held: held && audio.hasVoice(key) });
      setState({ lastNote: noteName(midi), noteSrc: { midis: [midi] } });
    });
    if (!record) return;
    this.looper.record(this.clock.positionAt(when ?? audio.now), {
      kind: 'note',
      midi,
      vel,
      pan,
      dur: 2,
      instrument: s.instrument,
      key: String(key),
    });
  }

  /** Corre `fn` quando o áudio chegar a `when` (para as luzes acompanharem a quantização). */
  private at(when: number | undefined, fn: () => void): void {
    const ms = when === undefined ? 0 : (when - audio.now) * 1000;
    if (ms <= 4) return fn();
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  playDrum(
    slot: number,
    vel: number,
    finger?: number,
    when?: number,
    kitId?: string,
    record = true,
  ): void {
    const kit = DRUMS[kitId ?? getState().instrument];
    if (!kit) return;
    audio.drum(kit.id, slot, vel, 0, when);
    if (record)
      this.looper.record(this.clock.positionAt(when ?? audio.now), {
        kind: 'drum',
        slot,
        vel,
        instrument: kit.id,
      });
    this.at(when, () => this.showDrum(kit.id, slot, vel, finger));
  }

  private showDrum(kitId: string, slot: number, vel: number, finger?: number): void {
    live.pads[slot] = 1;
    setState({ lastNote: padLabels(kitId)[slot], noteSrc: { kit: kitId, slot } });
    const c = FINGER_COLORS[finger ?? [1, 2, 3, 4, 6, 7, 8, 9][slot] ?? 0];
    const tip = finger !== undefined ? live.fingers[finger].tip : null;
    pushBurst({ x: tip?.x ?? (slot + 0.5) / 8, y: tip?.y ?? 0.7, color: c, strength: vel });
  }

  // ---------- interface (teclado de piano e pads com rato/toque) ----------
  /** Tecla do teclado de piano; `record = false` (pré-escuta) não chega ao looper. */
  pianoDown(midi: number, vel = 0.8, record = true): void {
    this.ensureAudio();
    this.startLoop();
    const info = instrumentInfo(getState().instrument);
    if (info.kind === 'drum') {
      this.playDrum(((midi % 8) + 8) % 8, vel, undefined, undefined, undefined, record);
      return;
    }
    if (info.kind === 'continuous') {
      // o theremin é contínuo; pelo teclado toca como um lead curto
      audio.noteOn(`k${midi}`, 'synth', midi, vel, 0);
      live.notes.set(midi, { level: 1, color: FINGER_COLORS[7], held: true });
      return;
    }
    const pan = clamp((midi - 60) / 30, -0.8, 0.8);
    const color = FINGER_COLORS[((midi % 10) + 10) % 10];
    this.playNote(`k${midi}`, midi, vel, pan, color, true, undefined, record);
  }

  pianoUp(midi: number, record = true): void {
    audio.noteOff(`k${midi}`);
    if (record) this.looper.release(this.clock.positionAt(audio.now), `k${midi}`);
    const n = live.notes.get(midi);
    if (n) n.held = false;
  }

  /**
   * Pré-escuta de uma nota (editor do modo Personalizado): um toque curto pelo teclado de piano,
   * que nunca é gravado no looper.
   */
  previewNote(midi: number): void {
    this.pianoDown(midi, 0.8, false);
    const id = setTimeout(() => {
      this.timers.delete(id);
      this.pianoUp(midi, false);
    }, PREVIEW_MS);
    this.timers.add(id);
  }

  padDown(slot: number, vel = 0.85): void {
    this.ensureAudio();
    this.startLoop();
    // Com um instrumento melódico, os pads tocam o kit acústico.
    const s = getState();
    this.playDrum(slot, vel, undefined, undefined, DRUMS[s.instrument] ? s.instrument : 'drums');
  }

  // ---------- tempo, metrónomo e looper ----------
  private onStep(step: number, time: number): void {
    const s = getState();
    const lp = this.looper;
    const counting = lp.state === 'armed' || lp.state === 'recording';
    if ((s.metronome || counting) && step % STEPS_PER_BEAT === 0)
      audio.click(time, step % STEPS_PER_BAR === 0);
    const stepDur = this.clock.stepDur;
    for (const { ev, offset } of lp.eventsAt(step))
      this.playLoopEvent(ev, time + offset * stepDur, stepDur);
    // estado visual (atrasado até ao momento real do passo)
    this.at(time, () => {
      live.step = step;
      if (lp.advance(step) || (step % STEPS_PER_BAR === 0 && lp.state !== 'idle'))
        this.publishLooper();
    });
  }

  private playLoopEvent(ev: LoopEvent, when: number, stepDur: number): void {
    const s = getState();
    const cur = instrumentInfo(s.instrument);
    if (ev.kind === 'drum') {
      const kit = !s.loopFreeze && cur.kind === 'drum' ? cur.id : ev.instrument;
      audio.drum(kit, ev.slot, ev.vel, 0, when);
      this.at(when, () => this.showDrum(kit, ev.slot, ev.vel));
      return;
    }
    const inst = !s.loopFreeze && cur.kind === 'melodic' ? cur.id : ev.instrument;
    const key = `L${++this.loopSeq}`;
    audio.noteOn(key, inst, ev.midi, ev.vel, ev.pan, when);
    const color = FINGER_COLORS[((ev.midi % 10) + 10) % 10];
    this.at(when, () => live.notes.set(ev.midi, { level: 1, color, held: true }));
    this.at(when + ev.dur * stepDur, () => {
      audio.noteOff(key);
      const n = live.notes.get(ev.midi);
      if (n) n.held = false;
    });
  }

  private publishLooper(): void {
    const lp = this.looper;
    setState({
      looper: {
        state: lp.state,
        layers: lp.layers.length,
        bar: lp.barAt(this.clock.positionAt(audio.now)),
      },
    });
  }

  /** Botão principal do looper: gravar → (a tocar) sobrepor → fechar a camada. */
  loopRecord(): void {
    this.ensureAudio();
    const lp = this.looper;
    const now = audio.now;
    if (lp.state === 'idle') {
      lp.arm(this.clock.nextBarTime(now + 0.05).step, getState().loopBars);
    } else if (lp.state === 'playing') {
      if (lp.overdubbing) lp.stopOverdub(this.clock.positionAt(now));
      else lp.startOverdub();
    } else if (lp.state === 'armed') {
      lp.clear();
    }
    this.publishLooper();
  }

  loopUndo(): void {
    this.looper.undo();
    this.publishLooper();
  }

  loopClear(): void {
    this.looper.clear();
    this.publishLooper();
  }

  tapTempo(): void {
    this.ensureAudio();
    const bpm = this.tapper.tap(performance.now());
    if (bpm) setState({ bpm });
  }

  // ---------- modo teclado ----------
  installKeyboard(): () => void {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target as HTMLElement | null))
        return;
      if (e.code === 'Space') {
        e.preventDefault();
        this.ensureAudio();
        this.startLoop();
        live.spaceHeld = true;
        return;
      }
      const k = e.key.toLowerCase();
      if (!(k in KEYMAP) || this.keysDown.has(k)) return;
      const i = KEYMAP[k];
      if (!isActive(i, getState().thumbs)) return;
      this.ensureAudio();
      this.startLoop();
      this.keysDown.add(k);
      const f = live.fingers[i];
      f.curl = 1;
      f.down = true;
      if (this.gestureOptions().continuous) {
        this.fingerContinuous(i, KEY_CONT_LEVEL, 0);
        live.fx[i].flash = 1;
      } else this.fingerOn(i, KEY_VELOCITY, 0);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        live.spaceHeld = false;
        return;
      }
      const k = e.key.toLowerCase();
      if (!(k in KEYMAP) || !this.keysDown.has(k)) return;
      this.keysDown.delete(k);
      const i = KEYMAP[k];
      const f = live.fingers[i];
      f.curl = 0;
      f.down = false;
      if (this.gestureOptions().continuous) audio.continuous(i, this.fingerMidi(i, 0), 0);
      else this.fingerOff(i);
    };
    const blur = () => {
      live.spaceHeld = false;
      this.keysDown.forEach((k) => {
        const i = KEYMAP[k];
        live.fingers[i].down = false;
        live.fingers[i].curl = 0;
        this.fingerOff(i);
      });
      this.keysDown.clear();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }

  // ---------- reações ao store ----------
  installStoreSync(): () => void {
    samples.setCurrent(getState().instrument);
    this.gesture.adaptive.load(getState().learnedRanges);
    this.learnSaved = this.gesture.adaptive.version;
    const offSamples = samples.on('status', ({ id, status }) => {
      const next = { ...getState().sampleStatus };
      // `idle`: os buffers saíram da memória (instrumento usado há mais tempo)
      if (status === 'idle') delete next[id];
      else next[id] = status;
      setState({ sampleStatus: next });
    });
    // sem rede o carregamento falha; quando a rede volta, tenta de novo o instrumento atual
    const offOnline = samples.retryOnOnline(window, () => (audio.ready ? audio.ctx : null));
    const offStore = useStore.subscribe((s, prev) => {
      if (
        s.volume !== prev.volume ||
        s.muted !== prev.muted ||
        s.reverb !== prev.reverb ||
        s.echo !== prev.echo ||
        s.filter !== prev.filter ||
        s.drive !== prev.drive ||
        s.pitch !== prev.pitch
      )
        this.syncParams(s);
      if (s.instrument !== prev.instrument) {
        this.releaseAll();
        if (instrumentInfo(prev.instrument).kind === 'continuous') audio.destroyTheremin();
        samples.setCurrent(s.instrument);
        // ao percorrer instrumentos só se carrega aquele onde se para (~300 ms); tocar antes
        // disso começa logo o carregamento (noteOn)
        if (this.sampleTimer) clearTimeout(this.sampleTimer);
        const id = s.instrument;
        this.sampleTimer = setTimeout(() => {
          this.sampleTimer = null;
          this.loadSamples(id);
        }, SAMPLE_LOAD_DELAY_MS);
      }
      if (s.thumbs !== prev.thumbs) {
        this.releaseAll();
        live.fingers.forEach((f) => {
          f.curl = 0;
          f.tip = null;
        });
        this.motion?.reset();
      }
      if (
        s.root !== prev.root ||
        s.scale !== prev.scale ||
        s.octave !== prev.octave ||
        s.chord !== prev.chord ||
        s.tonicAt !== prev.tonicAt ||
        s.noteMode !== prev.noteMode ||
        s.customNotes !== prev.customNotes
      )
        this.releaseAll();
      if (s.bpm !== prev.bpm) this.clock.setBpm(s.bpm);
      // intervalos aprendidos mudados por fora da sessão ("Repor as preferências", outro separador)
      if (s.learnedRanges !== prev.learnedRanges && s.learnedRanges !== this.learnWritten) {
        this.gesture.adaptive.load(s.learnedRanges);
        this.learnSaved = this.gesture.adaptive.version;
      }
      if ((s.cameraId !== prev.cameraId || s.lowRes !== prev.lowRes) && this.stream)
        void this.restartCamera();
    });
    return () => {
      offSamples();
      offOnline();
      offStore();
      if (this.sampleTimer) clearTimeout(this.sampleTimer);
      this.sampleTimer = null;
    };
  }

  releaseAll(): void {
    this.gesture.releaseAll();
    audio.releaseAll();
    for (let i = 0; i < 10; i++) this.releaseFingerNote(i);
    live.notes.forEach((n) => (n.held = false));
  }

  // ---------- arranque ----------
  /**
   * Liga o som e a câmara. Se a câmara falhar, fica no modo teclado com o erro em `cameraError`
   * (o palco oferece tentar outra vez ou tocar no ecrã) e pode voltar a ser chamado.
   */
  async start(): Promise<void> {
    this.ensureAudio();
    if (this.cameraBusy) return;
    this.cameraBusy = true;
    setState({
      started: true,
      cameraError: null,
      cameraStarting: true,
      status: t().status.askCamera,
    });
    this.startLoop();
    try {
      await this.openCamera();
    } catch (e) {
      const msg = e instanceof CameraError ? cameraError(e.code) : t().status.cameraFailed;
      this.cameraBusy = false;
      setState({ engine: 'keyboard', cameraError: msg, cameraStarting: false, status: '' });
      return;
    }
    // com a câmara ligada, o teclado tátil (de quem começou sem câmara) sai do caminho
    setState({ touchKeys: false, status: t().status.cameraOn });
    try {
      await this.hands.init(LOAD_TIMEOUT_MS);
      setState({
        engine: 'hands',
        cameraStarting: false,
        status: t().status.ready,
      });
      setTimeout(() => {
        if (getState().engine !== 'hands') return;
        if (this.detections === 0) this.useMotion();
        else if (getState().status === t().status.ready) setState({ status: '' });
      }, NO_RESULT_MS);
    } catch (e) {
      console.info('[visão] detetor de mãos indisponível, a usar o modo movimento.', e);
      this.useMotion();
    }
    try {
      await this.face.init(LOAD_TIMEOUT_MS);
      setState({ faceState: 'ok' });
    } catch (e) {
      console.info('[visão] detetor da boca indisponível.', e);
      setState({ faceState: 'unavailable' });
    }
  }

  /** Começa sem câmara: só o som, com o teclado tátil à vista (e o do computador). */
  startWithoutCamera(): void {
    this.ensureAudio();
    this.startLoop();
    if (this.cameraBusy) return;
    setState({ started: true, engine: 'keyboard', touchKeys: true, cameraError: null, status: '' });
  }

  async openCamera(): Promise<void> {
    const s = getState();
    const stream = await openCamera({ deviceId: s.cameraId, lowRes: s.lowRes });
    stopStream(this.stream);
    this.stream = stream;
    const v = this.video;
    if (!v) return;
    v.srcObject = stream;
    await new Promise<void>((r) => {
      if (v.readyState >= 1) r();
      else v.onloadedmetadata = () => r();
    });
    try {
      await v.play();
    } catch {
      /* autoplay bloqueado: o vídeo arranca no próximo gesto */
    }
    live.videoW = v.videoWidth || CAMERA_SIZE.width;
    live.videoH = v.videoHeight || CAMERA_SIZE.height;
  }

  /** Troca de câmara ou de resolução com a app a correr. */
  async restartCamera(): Promise<void> {
    try {
      await this.openCamera();
      this.motion?.reset();
    } catch (e) {
      setState({
        status: e instanceof CameraError ? cameraError(e.code) : t().status.cameraFailed,
      });
    }
  }

  useMotion(): void {
    this.gesture.releaseAll();
    this.motion ??= new MotionDetector(live.fingers, this.gesture);
    setState({
      engine: 'motion',
      cameraStarting: false,
      status: t().status.motion,
    });
  }

  // ---------- ciclo de deteção ----------
  startLoop(): void {
    if (this.raf) return;
    this.lastT = this.lastProcT = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private tick(now: number): void {
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const s = getState();
    const v = this.video;

    const fresh = !!v && v.readyState >= 2 && v.currentTime !== this.lastVideoTime;
    if (fresh && v) {
      this.lastVideoTime = v.currentTime;
      this.faceGap++;
      // o tablet pode rodar a imagem da câmara sem reabrir o stream: o overlay segue-a
      if (v.videoWidth && (v.videoWidth !== live.videoW || v.videoHeight !== live.videoH)) {
        live.videoW = v.videoWidth;
        live.videoH = v.videoHeight;
      }
      if (s.engine === 'hands' && !this.detectionPaused) {
        try {
          this.stats.handDetects++;
          const r = this.hands.detect(v, now);
          if (r) {
            this.detections++;
            this.fpsCount++;
            this.processHands(r.hands, now, r.handedness);
          }
        } catch (e) {
          console.warn('[visão] erro na deteção', e);
        }
      } else if (s.engine === 'motion' && this.motion) {
        const o = this.gestureOptions();
        this.motion.process(v, dt, {
          sensitivity: o.sensitivity,
          thumbs: o.thumbs,
          continuous: o.continuous,
          sustain: instrumentInfo(s.instrument).sustain,
        });
      }
    }
    // A face (boca) só corre com um efeito da boca escolhido, e nunca antes das mãos: num tick
    // sem fotograma novo ou, se não houver nenhum, depois das mãos (ver FACE_EVERY).
    if (
      v &&
      this.face.ready &&
      s.mouthFx !== 'off' &&
      v.readyState >= 2 &&
      this.faceGap >= FACE_EVERY &&
      (!fresh || this.faceGap >= FACE_MAX_GAP)
    ) {
      this.faceGap = 0;
      try {
        this.stats.faceDetects++;
        const lm = this.face.detect(v, now);
        if (lm) {
          live.lips = lm;
          live.lipsT = now;
          live.mouthTarget = mouthOpenness(lm);
        }
      } catch (e) {
        console.warn('[visão] erro na deteção da face', e);
      }
    } else if (s.mouthFx === 'off') live.lips = null;

    // boca
    if (live.spaceHeld) live.mouthTarget = 1;
    else if (s.mouthFx === 'off' || now - live.lipsT > 600) live.mouthTarget = 0;
    live.mouth += (live.mouthTarget - live.mouth) * Math.min(1, dt * 18);
    audio.setMouth(live.mouth, s.mouthFx);

    if (now - this.fpsT > 1000) {
      live.fps = this.fpsCount;
      this.fpsCount = 0;
      this.fpsT = now;
    }
    for (const fx of live.fx) fx.flash = Math.max(0, fx.flash - dt * 2.2);
    for (let k = 0; k < live.pads.length; k++) live.pads[k] = Math.max(0, live.pads[k] - dt * 3);
    live.notes.forEach((n, m) => {
      if (!n.held) {
        n.level -= dt * 2.5;
        if (n.level <= 0) live.notes.delete(m);
      }
    });
  }

  private processHands(hands: Pt[][], now: number, handedness: (Handedness | null)[] = []): void {
    const pdt = clamp((now - this.lastProcT) / 1000, 0.008, 0.1);
    this.lastProcT = now;
    live.hands = hands;
    live.handsT = now;
    const assigned = assignHands(hands, handedness, this.handState);
    // A calibração recolhe as dobras de todos os dedos, polegares incluídos, mesmo com os
    // polegares desligados (o gestureEngine não calcula a dobra dos dedos inativos).
    if (this.cal) {
      const aspect = aspectOf({ videoW: live.videoW, videoH: live.videoH });
      const c = assigned.flatMap((lm) => (lm ? curls(lm, aspect) : [null, null, null, null, null]));
      this.cal.collector.add(this.cal.phase, c);
    }
    // confiança da lateralidade de cada lado (a aprendizagem ignora mãos pouco confiáveis)
    const scores = assigned.map((lm) => {
      const k = lm ? hands.indexOf(lm) : -1;
      return k >= 0 ? (handedness[k]?.score ?? null) : null;
    });
    this.gesture.process(assigned, pdt, this.gestureOptions(), scores, this.handState.swapped);
    this.saveLearned(now);
  }

  /** Guarda os intervalos aprendidos nas preferências, no máximo a cada `LEARN_SAVE_MS`. */
  private saveLearned(now: number): void {
    const a = this.gesture.adaptive;
    if (a.version === this.learnSaved || now - this.learnSavedT < LEARN_SAVE_MS) return;
    this.learnSaved = a.version;
    this.learnSavedT = now;
    const snap = a.snapshot();
    if (JSON.stringify(snap) === JSON.stringify(getState().learnedRanges)) return;
    this.learnWritten = snap;
    setState({ learnedRanges: snap });
  }

  /** Esquece o que a app aprendeu da mão (o botão "Repor calibração" também o faz). */
  forgetLearned(): void {
    this.gesture.adaptive.reset();
    this.learnSaved = this.gesture.adaptive.version;
    this.learnWritten = null;
    setState({ learnedRanges: null });
  }

  /**
   * Diagnóstico e testes: injeta pontos de mãos (já em espelho) no pipeline real. Sem
   * `handedness`, uma mão sozinha fica com o lado anterior ou com o lado do ecrã.
   */
  feedHands(hands: Pt[][], handedness?: (Handedness | null)[]): void {
    this.detectionPaused = true;
    if (getState().engine !== 'hands') setState({ engine: 'hands' });
    this.processHands(hands, performance.now(), handedness);
  }

  // ---------- calibração ----------
  async calibrate(): Promise<void> {
    if (this.cal) return;
    if (getState().engine !== 'hands') {
      setState({ status: t().status.calibNeedsHands });
      return;
    }
    this.releaseAll();
    const collector = new CalibrationCollector();
    const step = async (phase: CalPhase, text: string) => {
      this.cal = { collector, phase };
      for (let k = 3; k > 0; k--) {
        setState({
          calibrating: t().status.calibCount(text, k),
          status: t().status.calibCount(text, k),
        });
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    try {
      await step('open', t().status.calibOpen);
      await step('closed', t().status.calibClosed);
    } finally {
      this.cal = null;
    }
    const { calibration } = collector.result();
    // os polegares não usam a calibração (tocam ao mexer-se, decisão 65): a mensagem conta os 8 dedos
    const fingers = calibration.closed.filter(
      (c, i) => c - calibration.open[i] > 0.2 && isActive(i, false),
    ).length;
    if (fingers >= 4) {
      setState({
        calibration,
        calibrating: null,
        status: t().status.calibDone(fingers),
      });
    } else {
      setState({
        calibrating: null,
        status: t().status.calibFailed,
      });
    }
    // limpa só a mensagem que pôs (outra, entretanto, fica)
    const shown = getState().status;
    setTimeout(() => {
      if (getState().status === shown) setState({ status: '' });
    }, 5000);
  }

  // ---------- câmaras ----------
  async cameras(): Promise<{ id: string; label: string }[]> {
    return listCameras();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    stopStream(this.stream);
    this.stream = null;
    this.clock.stop();
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.hands.close();
    this.face.close();
    this.motion?.reset();
  }
}

export const session = new Session();
