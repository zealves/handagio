// Gravação do master com MediaStreamAudioDestinationNode + MediaRecorder. Opcionalmente grava
// também vídeo: um canvas escondido compõe a câmara em espelho e os overlays, e o seu
// captureStream() junta-se à pista de áudio.

import { containRect } from '../lib/cover';

export type RecordingKind = 'audio' | 'video';

const AUDIO_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
const VIDEO_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1,mp4a',
  'video/mp4',
];

/** Primeiro formato suportado (webm/opus; mp4 no Safari). '' = deixa o navegador escolher. */
export function pickMime(
  kind: RecordingKind,
  isSupported = (t: string) => MediaRecorder.isTypeSupported(t),
): string {
  return (kind === 'audio' ? AUDIO_TYPES : VIDEO_TYPES).find((t) => isSupported(t)) ?? '';
}

export const extensionFor = (mime: string): string =>
  mime.includes('mp4')
    ? mime.startsWith('audio')
      ? 'm4a'
      : 'mp4'
    : mime.includes('ogg')
      ? 'ogg'
      : 'webm';

export interface RecordingResult {
  blob: Blob;
  mime: string;
  kind: RecordingKind;
  duration: number; // segundos
}

export interface VideoSource {
  /** Vídeo da câmara (desenhado em espelho). */
  video: HTMLVideoElement | null;
  /** Canvas desenhados por cima, pela ordem dada (partículas, overlay…). */
  layers: () => (HTMLCanvasElement | null)[];
  /** Texto extra (HUD) desenhado no canto. */
  hud?: () => string[];
  width: number;
  height: number;
}

/** Compõe a câmara e os overlays num canvas escondido, ao ritmo do rAF. */
class Compositor {
  readonly canvas = document.createElement('canvas');
  private raf = 0;

  constructor(private src: VideoSource) {
    this.canvas.width = src.width;
    this.canvas.height = src.height;
  }

  start(): void {
    const g = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      g.fillStyle = '#060a16';
      g.fillRect(0, 0, W, H);
      const v = this.src.video;
      if (v && v.readyState >= 2) {
        g.save();
        g.translate(W, 0);
        g.scale(-1, 1);
        g.drawImage(v, 0, 0, W, H);
        g.restore();
        g.fillStyle = 'rgba(6,10,22,.25)';
        g.fillRect(0, 0, W, H);
      }
      // camadas ao tamanho do palco (partículas): ficam no recorte da câmara que o palco mostra
      for (const c of this.src.layers()) {
        if (!c || !c.width) continue;
        const r = containRect(c.width, c.height, W, H);
        g.drawImage(c, r.x, r.y, r.w, r.h);
      }
      const hud = this.src.hud?.() ?? [];
      g.font = `600 ${Math.round(H / 32)}px Inter, system-ui, sans-serif`;
      g.textAlign = 'left';
      hud.forEach((line, k) => {
        const y = H / 18 + k * (H / 22);
        g.fillStyle = 'rgba(10,16,36,.6)';
        const w = g.measureText(line).width;
        g.fillRect(W / 60 - 8, y - H / 32, w + 16, H / 24);
        g.fillStyle = '#e8eeff';
        g.fillText(line, W / 60, y);
      });
    };
    draw();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}

export class Recorder {
  private dest: MediaStreamAudioDestinationNode | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startT = 0;
  private kind: RecordingKind = 'audio';
  private comp: Compositor | null = null;
  private videoStream: MediaStream | null = null;

  constructor(
    private ctx: AudioContext,
    private source: AudioNode,
  ) {}

  static get supported(): boolean {
    return typeof MediaRecorder !== 'undefined';
  }

  get recording(): boolean {
    return this.rec?.state === 'recording';
  }

  start(video?: VideoSource): RecordingKind {
    if (this.recording) return this.kind;
    if (!this.dest) {
      this.dest = this.ctx.createMediaStreamDestination();
      this.source.connect(this.dest);
    }
    const tracks = [...this.dest.stream.getAudioTracks()];
    this.kind = 'audio';
    if (video && typeof HTMLCanvasElement.prototype.captureStream === 'function') {
      this.comp = new Compositor(video);
      this.comp.start();
      this.videoStream = this.comp.canvas.captureStream(30);
      tracks.unshift(...this.videoStream.getVideoTracks());
      this.kind = 'video';
    }
    const mime = pickMime(this.kind);
    this.rec = new MediaRecorder(new MediaStream(tracks), {
      ...(mime ? { mimeType: mime } : {}),
      audioBitsPerSecond: 160_000,
      ...(this.kind === 'video' ? { videoBitsPerSecond: 4_000_000 } : {}),
    });
    this.chunks = [];
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.rec.start(250);
    this.startT = performance.now();
    return this.kind;
  }

  stop(): Promise<RecordingResult> {
    const rec = this.rec;
    if (!rec) return Promise.reject(new Error('Não há gravação em curso.'));
    return new Promise((resolve) => {
      rec.onstop = () => {
        const mime =
          rec.mimeType ||
          pickMime(this.kind) ||
          (this.kind === 'audio' ? 'audio/webm' : 'video/webm');
        const blob = new Blob(this.chunks, { type: mime });
        this.chunks = [];
        this.comp?.stop();
        this.comp = null;
        this.videoStream?.getTracks().forEach((t) => t.stop());
        this.videoStream = null;
        this.rec = null;
        resolve({
          blob,
          mime,
          kind: this.kind,
          duration: (performance.now() - this.startT) / 1000,
        });
      };
      rec.stop();
    });
  }
}
