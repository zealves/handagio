// Orquestrador (sem React): câmara → visão → gestos → áudio. Corre o seu próprio ciclo rAF,
// separado do render da interface.
import { clamp, degreeToMidi, noteName, scaleLength } from '../audio/theory';
import { getState, setState } from '../state/store';
import { live } from '../state/live';
import { openCamera, stopStream, CameraError } from '../vision/camera';
import { fingerDegree, isActive } from '../vision/fingerMap';
import { GestureEngine, type GestureOptions } from '../vision/gestureEngine';
import { assignHands, HandTracker } from '../vision/handTracker';
import { MotionDetector } from '../vision/motionFallback';

const NO_RESULT_MS = 6000;
const LOAD_TIMEOUT_MS = 20000;

class Session {
  video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  readonly gesture = new GestureEngine(live.fingers);
  private motion: MotionDetector | null = null;
  private hands = new HandTracker();
  private detections = 0;
  private raf = 0;
  private lastT = 0;
  private lastProcT = 0;
  private lastVideoTime = -1;
  private frame = 0;
  private fpsCount = 0;
  private fpsT = 0;
  private startedOnce = false;

  constructor() {
    this.gesture.on('noteOn', ({ finger, velocity, shift }) =>
      this.noteOn(finger, velocity, shift),
    );
    this.gesture.on('noteOff', ({ finger }) => this.noteOff(finger));
    this.gesture.on('continuous', ({ finger, level, pitch }) =>
      this.continuous(finger, level, pitch),
    );
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
      continuous: false,
      scaleLen: scaleLength(s.scale),
      calibration: s.calibration,
    };
  }

  /** Nota MIDI de um dedo com o deslocamento em graus. */
  fingerMidi(i: number, shift: number): number {
    const s = getState();
    return degreeToMidi(fingerDegree(i, s.thumbs) + shift, s);
  }

  // ---------- eventos de gestos ----------
  noteOn(i: number, _velocity: number, shift: number): void {
    if (!isActive(i, getState().thumbs)) return;
    const midi = this.fingerMidi(i, shift);
    const fx = live.fx[i];
    fx.flash = 1;
    fx.midi = midi;
    fx.label = noteName(midi);
    setState({ lastNote: fx.label });
  }

  noteOff(_i: number): void {}

  continuous(i: number, level: number, _pitch: number): void {
    live.fx[i].flash = Math.max(live.fx[i].flash, level);
  }

  // ---------- arranque ----------
  async start(): Promise<void> {
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
      console.warn('[visão] detetor de mãos indisponível', e);
      this.useMotion();
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
    if (!this.stream) return;
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
    this.frame++;

    const fresh = !!v && v.readyState >= 2 && v.currentTime !== this.lastVideoTime;
    if (fresh && v) {
      this.lastVideoTime = v.currentTime;
      if (s.engine === 'hands') {
        try {
          const r = this.hands.detect(v, now);
          if (r) {
            this.detections++;
            this.fpsCount++;
            const pdt = clamp((now - this.lastProcT) / 1000, 0.008, 0.1);
            this.lastProcT = now;
            live.hands = r.hands;
            live.handsT = now;
            this.gesture.process(assignHands(r.hands), pdt, this.gestureOptions());
          }
        } catch (e) {
          console.warn('[visão] erro na deteção', e);
        }
      } else if (s.engine === 'motion' && this.motion) {
        const o = this.gestureOptions();
        this.motion.process(v, dt, { ...o, continuous: o.continuous, sustain: false });
      }
    }

    if (now - this.fpsT > 1000) {
      live.fps = this.fpsCount;
      this.fpsCount = 0;
      this.fpsT = now;
    }
    for (const fx of live.fx) fx.flash = Math.max(0, fx.flash - dt * 2.2);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    stopStream(this.stream);
    this.stream = null;
    this.hands.close();
    this.motion?.reset();
  }
}

export const session = new Session();
