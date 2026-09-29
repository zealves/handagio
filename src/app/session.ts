// Orquestrador (sem React): câmara → visão → gestos → áudio. Corre o seu próprio ciclo rAF,
// separado do render da interface.
import { audio } from '../audio/engine';
import { DRUMS, instrumentInfo, isSampled, tuningOf } from '../audio/instruments';
import { samples } from '../audio/samples/loader';
import { Looper, type LoopEvent } from '../audio/looper';
import { Clock, quantizeTime, STEPS_PER_BAR, STEPS_PER_BEAT, TapTempo } from '../audio/metronome';
import { chordMidis, clamp, degreeToMidi, noteName, chordName, scaleLength } from '../audio/theory';
import { live, pushBurst } from '../state/live';
import { getState, setState, useStore, type Store } from '../state/store';
import { CameraError, listCameras, openCamera, stopStream } from '../vision/camera';
import { fingerDegree, isActive, KEYMAP, slotOf } from '../vision/fingerMap';
import { GestureEngine, type GestureOptions } from '../vision/gestureEngine';
import { CalibrationCollector, type CalPhase } from '../vision/calibration';
import { FaceTracker, mouthOpenness } from '../vision/faceTracker';
import { assignHands, HandTracker } from '../vision/handTracker';
import { MotionDetector } from '../vision/motionFallback';
import type { Pt } from '../vision/types';
import { FINGER_COLORS } from '../ui/theme';
import { isTypingTarget } from '../lib/keys';

const NO_RESULT_MS = 6000;
const LOAD_TIMEOUT_MS = 20000;
const KEY_VELOCITY = 0.75;
/** Nível contínuo equivalente ao ganho 0.16 que o protótipo usava no modo teclado. */
const KEY_CONT_LEVEL = Math.sqrt(0.16 / 0.18);

const fingerPan = (i: number) => (i - 4.5) / 6;
/** Chave da voz: o dedo (nota única ou fundamental) ou `dedo:k` para as outras notas do acorde. */
const voiceKey = (i: number, k: number): number | string => (k ? `${i}:${k}` : i);

class Session {
  video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  readonly gesture = new GestureEngine(live.fingers);
  private motion: MotionDetector | null = null;
  private hands = new HandTracker();
  private face = new FaceTracker();
  private frame = 0;
  private detections = 0;
  private raf = 0;
  private lastT = 0;
  private lastProcT = 0;
  private lastVideoTime = -1;
  private fpsCount = 0;
  private fpsT = 0;
  private startedOnce = false;
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
      const notes = this.fingerNote[finger];
      const base = this.fingerMidi(finger, 0) + pitch;
      const root = notes?.[0] ?? 0;
      (notes ?? [root]).forEach((m, k) => audio.glide(voiceKey(finger, k), base + (m - root)));
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
    return {
      sensitivity: s.sensitivity,
      thumbs: s.thumbs,
      heightPitch: s.heightPitch,
      glide: s.glide,
      continuous: instrumentInfo(s.instrument).kind === 'continuous',
      scaleLen: scaleLength(s.scale),
      calibration: s.calibration,
    };
  }

  /** Nota MIDI de um dedo com o deslocamento em graus. */
  fingerMidi(i: number, shift: number): number {
    const s = getState();
    return degreeToMidi(fingerDegree(i, s.thumbs) + shift, tuningOf(s));
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

  /** Carrega as amostras de um instrumento em segundo plano (precisa do AudioContext). */
  private loadSamples(id: string): void {
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
      fx.label = DRUMS[info.id].labels[slot];
      return;
    }
    if (info.kind === 'continuous') return;
    const midis = chordMidis(fingerDegree(i, s.thumbs) + shift, tuningOf(s), s.chord);
    const midi = midis[0];
    fx.midi = midi;
    fx.label = midis.length > 1 ? chordName(midis) : noteName(midi);
    this.releaseFingerNote(i);
    this.fingerNote[i] = midis;
    // nos acordes, as vozes extra soam um pouco mais baixo para não saturar
    midis.forEach((m, k) =>
      this.playNote(
        voiceKey(i, k),
        m,
        velocity * (k ? 0.7 : 1),
        fingerPan(i),
        FINGER_COLORS[i],
        info.sustain,
        when,
      ),
    );
    if (midis.length > 1) setState({ lastNote: fx.label });
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
      setState({ lastNote: fx.label });
    }
  }

  /** Toca uma nota melódica numa voz identificada por `key` (e grava-a no looper). */
  playNote(
    key: number | string,
    midi: number,
    vel: number,
    pan: number,
    color: string,
    held: boolean,
    when?: number,
  ): void {
    const s = getState();
    audio.noteOn(key, s.instrument, midi, vel, pan, when);
    this.at(when, () => {
      // se a nota já foi solta antes de soar (quantização), a luz não fica presa
      live.notes.set(midi, { level: 1, color, held: held && audio.hasVoice(key) });
      setState({ lastNote: noteName(midi) });
    });
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

  playDrum(slot: number, vel: number, finger?: number, when?: number, kitId?: string): void {
    const kit = DRUMS[kitId ?? getState().instrument];
    if (!kit) return;
    audio.drum(kit.id, slot, vel, 0, when);
    this.looper.record(this.clock.positionAt(when ?? audio.now), {
      kind: 'drum',
      slot,
      vel,
      instrument: kit.id,
    });
    this.at(when, () => this.showDrum(kit.id, slot, vel, finger));
  }

  private showDrum(kitId: string, slot: number, vel: number, finger?: number): void {
    const kit = DRUMS[kitId];
    live.pads[slot] = 1;
    setState({ lastNote: kit.labels[slot] });
    const c = FINGER_COLORS[finger ?? [1, 2, 3, 4, 6, 7, 8, 9][slot] ?? 0];
    const tip = finger !== undefined ? live.fingers[finger].tip : null;
    pushBurst({ x: tip?.x ?? (slot + 0.5) / 8, y: tip?.y ?? 0.7, color: c, strength: vel });
  }

  // ---------- interface (teclado de piano e pads com rato/toque) ----------
  pianoDown(midi: number, vel = 0.8): void {
    this.ensureAudio();
    this.startLoop();
    const info = instrumentInfo(getState().instrument);
    if (info.kind === 'drum') {
      this.playDrum(((midi % 8) + 8) % 8, vel);
      return;
    }
    if (info.kind === 'continuous') {
      // o theremin é contínuo; pelo teclado toca como um lead curto
      audio.noteOn(`k${midi}`, 'synth', midi, vel, 0);
      live.notes.set(midi, { level: 1, color: FINGER_COLORS[7], held: true });
      return;
    }
    const pan = clamp((midi - 60) / 30, -0.8, 0.8);
    this.playNote(`k${midi}`, midi, vel, pan, FINGER_COLORS[((midi % 10) + 10) % 10], true);
  }

  pianoUp(midi: number): void {
    audio.noteOff(`k${midi}`);
    this.looper.release(this.clock.positionAt(audio.now), `k${midi}`);
    const n = live.notes.get(midi);
    if (n) n.held = false;
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
    const offSamples = samples.on('status', ({ id, status }) => {
      if (status === 'idle') return;
      setState({ sampleStatus: { ...getState().sampleStatus, [id]: status } });
    });
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
        this.loadSamples(s.instrument);
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
        s.chord !== prev.chord
      )
        this.releaseAll();
      if (s.bpm !== prev.bpm) this.clock.setBpm(s.bpm);
      if ((s.cameraId !== prev.cameraId || s.lowRes !== prev.lowRes) && this.stream)
        void this.restartCamera();
    });
    return () => {
      offSamples();
      offStore();
    };
  }

  releaseAll(): void {
    this.gesture.releaseAll();
    audio.releaseAll();
    for (let i = 0; i < 10; i++) this.releaseFingerNote(i);
    live.notes.forEach((n) => (n.held = false));
  }

  // ---------- arranque ----------
  async start(): Promise<void> {
    this.ensureAudio();
    if (this.startedOnce) return;
    this.startedOnce = true;
    setState({ started: true, status: 'A pedir acesso à câmara…' });
    this.startLoop();
    try {
      await this.openCamera();
    } catch (e) {
      const msg = e instanceof CameraError ? e.message : 'A câmara não arrancou.';
      setState({ engine: 'keyboard', status: `${msg} Entretanto toca com o teclado.` });
      return;
    }
    setState({ status: 'Câmara ligada. A carregar o detetor de dedos…' });
    try {
      await this.hands.init(LOAD_TIMEOUT_MS);
      setState({ engine: 'hands', status: 'Pronto. Mostra as mãos e dobra os dedos.' });
      setTimeout(() => {
        if (getState().engine !== 'hands') return;
        if (this.detections === 0) this.useMotion();
        else if (getState().status.startsWith('Pronto')) setState({ status: '' });
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
    live.videoW = v.videoWidth || 1280;
    live.videoH = v.videoHeight || 720;
    setState({ videoSize: { w: live.videoW, h: live.videoH } });
  }

  /** Troca de câmara ou de resolução com a app a correr. */
  async restartCamera(): Promise<void> {
    try {
      await this.openCamera();
      this.motion?.reset();
    } catch (e) {
      setState({ status: e instanceof CameraError ? e.message : 'A câmara não arrancou.' });
    }
  }

  useMotion(): void {
    this.gesture.releaseAll();
    this.motion ??= new MotionDetector(live.fingers, this.gesture);
    setState({
      engine: 'motion',
      status:
        'Modo movimento: o detetor de dedos não carregou, por isso cada coluna do ecrã é um dedo. Mexe a mão numa coluna para tocar.',
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
      if (s.engine === 'hands' && !this.detectionPaused) {
        try {
          const r = this.hands.detect(v, now);
          if (r) {
            this.detections++;
            this.fpsCount++;
            this.processHands(r.hands, now);
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
      // A face corre em fotogramas alternados.
      if (this.face.ready && ++this.frame % 2 === 0) {
        try {
          const lm = this.face.detect(v, now);
          if (lm) {
            live.lips = lm;
            live.lipsT = now;
            live.mouthTarget = mouthOpenness(lm);
          }
        } catch (e) {
          console.warn('[visão] erro na deteção da face', e);
        }
      }
    }

    if (this.cal)
      this.cal.collector.add(
        this.cal.phase,
        live.fingers.map((f) => (f.tip ? f.curl : null)),
      );

    // boca
    if (live.spaceHeld) live.mouthTarget = 1;
    else if (now - live.lipsT > 600) live.mouthTarget = 0;
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

  private processHands(hands: Pt[][], now: number): void {
    const pdt = clamp((now - this.lastProcT) / 1000, 0.008, 0.1);
    this.lastProcT = now;
    live.hands = hands;
    live.handsT = now;
    this.gesture.process(assignHands(hands), pdt, this.gestureOptions());
  }

  /** Diagnóstico e testes: injeta pontos de mãos (já em espelho) no pipeline real. */
  feedHands(hands: Pt[][]): void {
    this.detectionPaused = true;
    if (getState().engine !== 'hands') setState({ engine: 'hands' });
    this.processHands(hands, performance.now());
  }

  // ---------- calibração ----------
  async calibrate(): Promise<void> {
    if (this.cal) return;
    if (getState().engine !== 'hands') {
      setState({ status: 'A calibração precisa da deteção das mãos. Liga a câmara primeiro.' });
      return;
    }
    this.releaseAll();
    const collector = new CalibrationCollector();
    const step = async (phase: CalPhase, text: string) => {
      this.cal = { collector, phase };
      for (let k = 3; k > 0; k--) {
        setState({ calibrating: `${text} ${k}…`, status: `${text} ${k}…` });
        await new Promise((r) => setTimeout(r, 1000));
      }
    };
    try {
      await step('open', 'Mostra as duas mãos e estica bem todos os dedos.');
      await step('closed', 'Agora dobra todos os dedos, como um punho.');
    } finally {
      this.cal = null;
    }
    const { calibration, fingers } = collector.result();
    if (fingers >= 4) {
      setState({
        calibration,
        calibrating: null,
        status: `Calibração feita para ${fingers} dedos. Podes voltar a calibrar ou repor nas definições.`,
      });
    } else {
      setState({
        calibrating: null,
        status:
          'Não consegui ver bem os dedos. Põe as mãos à frente da câmara com boa luz e tenta outra vez.',
      });
    }
    setTimeout(() => {
      if (
        getState().status.startsWith('Calibração feita') ||
        getState().status.startsWith('Não consegui')
      )
        setState({ status: '' });
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
