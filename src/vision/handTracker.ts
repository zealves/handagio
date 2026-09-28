// HandLandmarker em modo VIDEO: deteção por fotograma e atribuição esquerda/direita.
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { assetUrl, createWithFallback, getVisionFileset, withTimeout } from './mediapipe';
import type { AssignedHands, HandLandmarks, Pt } from './types';

/** Converte para espelho (x → 1 − x): a esquerda do ecrã é a esquerda do utilizador. */
export const mirror = (lm: { x: number; y: number; z: number }[]): Pt[] =>
  lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));

/**
 * Com duas mãos, o lado vem da posição x do pulso; com uma só, do lado do ecrã em que está.
 */
export function assignHands(list: HandLandmarks[]): AssignedHands {
  const out: AssignedHands = [null, null];
  if (list.length >= 2) {
    const s = [list[0], list[1]].sort((a, b) => a[0].x - b[0].x);
    out[0] = s[0];
    out[1] = s[1];
  } else if (list.length === 1) {
    out[list[0][0].x < 0.5 ? 0 : 1] = list[0];
  }
  return out;
}

export class HandTracker {
  private task: HandLandmarker | null = null;
  delegate: 'GPU' | 'CPU' = 'GPU';
  private lastTs = 0;

  async init(timeoutMs = 20000): Promise<void> {
    const load = async () => {
      const fs = await getVisionFileset();
      const { task, delegate } = await createWithFallback((d) =>
        HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: assetUrl('hand_landmarker.task'), delegate: d },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
      );
      this.task = task;
      this.delegate = delegate;
    };
    await withTimeout(load(), timeoutMs, 'Detetor de mãos');
  }

  get ready(): boolean {
    return !!this.task;
  }

  /** Devolve null se não houve deteção (vídeo sem fotograma novo ou erro). */
  detect(video: HTMLVideoElement, now: number): { hands: HandLandmarks[] } | null {
    if (!this.task || video.readyState < 2) return null;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const r = this.task.detectForVideo(video, ts);
    return { hands: r.landmarks.map(mirror) };
  }

  close(): void {
    this.task?.close();
    this.task = null;
  }
}
