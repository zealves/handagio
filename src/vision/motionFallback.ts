// Modo movimento: quando a deteção das mãos não carrega, o ecrã divide-se em colunas (uma por
// dedo) e cada coluna dispara com a diferença entre fotogramas. Portado de processMotion().
import { clamp } from '../audio/theory';
import type { Emitter } from '../lib/emitter';
import { activeScreenOrder } from './fingerMap';
import type { FingerLive, GestureEvents } from './gestureEngine';

const W = 160;
const H = 120;

export interface MotionOptions {
  sensitivity: number;
  thumbs: boolean;
  continuous: boolean;
  sustain: boolean;
}

export class MotionDetector {
  private cv: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private prev: Uint8ClampedArray | null = null;
  readonly zoneLevel = new Array<number>(10).fill(0);
  private zoneCool = new Array<number>(10).fill(0);
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private fingers: FingerLive[],
    private out: Emitter<GestureEvents>,
  ) {
    this.cv = document.createElement('canvas');
    this.cv.width = W;
    this.cv.height = H;
    this.g = this.cv.getContext('2d', { willReadFrequently: true })!;
  }

  /** Zonas a partir de uma imagem RGBA 160×120 (exposto para testes). */
  static zoneSums(fr: Uint8ClampedArray, prev: Uint8ClampedArray | null, zones: number): number[] {
    const sums = new Array<number>(zones).fill(0);
    if (!prev) return sums;
    for (let y = 0; y < 80; y += 2)
      for (let x = 0; x < W; x += 2) {
        const k = (y * W + x) * 4;
        const diff =
          Math.abs(fr[k] - prev[k]) +
          Math.abs(fr[k + 1] - prev[k + 1]) +
          Math.abs(fr[k + 2] - prev[k + 2]);
        if (diff > 60) sums[Math.min(zones - 1, Math.floor(x / (W / zones)))]++;
      }
    return sums;
  }

  process(video: HTMLVideoElement, dt: number, o: MotionOptions): void {
    if (video.readyState < 2) return;
    const g = this.g;
    g.save();
    g.translate(W, 0);
    g.scale(-1, 1);
    g.drawImage(video, 0, 0, W, H);
    g.restore();
    const order = activeScreenOrder(o.thumbs);
    const Z = order.length;
    const fr = g.getImageData(0, 0, W, H).data;
    const sums = MotionDetector.zoneSums(fr, this.prev, Z);
    this.prev = new Uint8ClampedArray(fr);
    const th = 60 - o.sensitivity * 45;
    for (let z = 0; z < Z; z++) {
      const i = order[z];
      const f = this.fingers[i];
      this.zoneLevel[i] = this.zoneLevel[i] * 0.6 + sums[z] * 0.4;
      this.zoneCool[i] -= dt;
      f.curl = clamp(this.zoneLevel[i] / (th * 2.5), 0, 1);
      f.tip = { x: (z + 0.5) / Z, y: 0.3 };
      if (o.continuous) {
        this.out.emit('continuous', { finger: i, level: f.curl, pitch: 0 });
      } else if (this.zoneLevel[i] > th && this.zoneCool[i] <= 0) {
        this.zoneCool[i] = 0.25;
        this.out.emit('noteOn', {
          finger: i,
          velocity: clamp(this.zoneLevel[i] / (th * 4), 0.2, 1),
          shift: 0,
        });
        if (o.sustain) {
          const id = setTimeout(() => {
            this.timers.delete(id);
            this.out.emit('noteOff', { finger: i });
          }, 400);
          this.timers.add(id);
        }
      }
    }
  }

  reset(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.zoneLevel.fill(0);
    this.zoneCool.fill(0);
    this.prev = null;
  }
}
