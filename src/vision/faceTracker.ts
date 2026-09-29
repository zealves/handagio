// FaceLandmarker em modo VIDEO: abertura da boca. Corre em fotogramas alternados.
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import { clamp } from '../audio/theory';
import { mirror } from './handTracker';
import { assetUrl, createWithFallback, getVisionFileset, withTimeout } from './mediapipe';
import type { Pt } from './types';

/**
 * Abertura da boca: distância 13–14 (lábios interiores) a dividir pela largura 61–291,
 * mapeada com clamp((r − 0.08) / 0.45, 0, 1). Valores do protótipo.
 */
export function mouthOpenness(lm: Pt[]): number {
  const dd = (a: number, b: number) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const ratio = dd(13, 14) / (dd(61, 291) || 1);
  return clamp((ratio - 0.08) / 0.45, 0, 1);
}

export class FaceTracker {
  private task: FaceLandmarker | null = null;
  private lastTs = 0;

  async init(timeoutMs = 20000): Promise<void> {
    const load = async () => {
      const fs = await getVisionFileset();
      const { task } = await createWithFallback((d) =>
        FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: assetUrl('face_landmarker.task'), delegate: d },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
        }),
      );
      this.task = task;
    };
    await withTimeout(load(), timeoutMs, 'Detetor da boca');
  }

  get ready(): boolean {
    return !!this.task;
  }

  /** Pontos da face (em espelho) ou null se não houver cara. */
  detect(video: HTMLVideoElement, now: number): Pt[] | null {
    if (!this.task || video.readyState < 2) return null;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const r = this.task.detectForVideo(video, ts);
    const lm = r.faceLandmarks[0];
    return lm ? mirror(lm) : null;
  }

  close(): void {
    this.task?.close();
    this.task = null;
  }
}
