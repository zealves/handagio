// HandLandmarker em modo VIDEO: deteção por fotograma e atribuição esquerda/direita.
import { HandLandmarker } from '@mediapipe/tasks-vision';
import { assetUrl, createWithFallback, getVisionFileset, withTimeout } from './mediapipe';
import type { AssignedHands, HandLandmarks, Pt } from './types';

/** Converte para espelho (x → 1 − x): a esquerda do ecrã é a esquerda do utilizador. */
export const mirror = (lm: { x: number; y: number; z: number }[]): Pt[] =>
  lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z }));

/** Lateralidade que o MediaPipe dá a uma mão (rótulo cru, tal como vem do modelo). */
export interface Handedness {
  label: 'Left' | 'Right';
  score: number;
}

/** Abaixo disto o rótulo da lateralidade é ignorado. */
export const HANDEDNESS_MIN_SCORE = 0.8;
/** Distância máxima do pulso entre fotogramas para a mesma mão manter o lado. */
export const CONTINUITY_DIST = 0.15;
/** Fotogramas com duas mãos usados para aprender a orientação dos rótulos. */
export const ORIENTATION_VOTES = 10;
/**
 * Orientação até haver dados: a documentação do MediaPipe diz que a lateralidade assume uma
 * imagem espelhada (selfie); o vídeo entra aqui sem espelho, por isso o rótulo vem trocado
 * ("Right" = mão esquerda do utilizador). Ver docs/DECISIONS.md.
 */
export const DEFAULT_LABELS_INVERTED = true;

/** Estado da atribuição de lados entre fotogramas (um por sessão, sem estado de módulo). */
export interface HandAssignState {
  /** Aprendido com duas mãos; null até haver votos. */
  labelsInverted: boolean | null;
  /** Últimos votos (true = rótulos trocados), no máximo `ORIENTATION_VOTES`. */
  votes: boolean[];
  /** Pulso de cada lado no fotograma anterior: [esquerda, direita]. */
  prev: [Pt | null, Pt | null];
}

export const createHandAssignState = (): HandAssignState => ({
  labelsInverted: null,
  votes: [],
  prev: [null, null],
});

/** Converte as categorias do resultado do MediaPipe (a mais provável de cada mão). */
export const toHandedness = (
  cats: { categoryName: string; score: number }[][],
): (Handedness | null)[] =>
  cats.map((c) => {
    const top = c[0];
    return top && (top.categoryName === 'Left' || top.categoryName === 'Right')
      ? { label: top.categoryName, score: top.score }
      : null;
  });

const confident = (h: Handedness | null | undefined): h is Handedness =>
  !!h && h.score >= HANDEDNESS_MIN_SCORE;

/** Lado do utilizador (0 = esquerda, 1 = direita) que um rótulo indica, dada a orientação. */
const sideOfLabel = (h: Handedness, inverted: boolean): 0 | 1 =>
  (h.label === 'Left') !== inverted ? 0 : 1;

function learn(state: HandAssignState, left: Handedness | null, right: Handedness | null): void {
  if (!confident(left) || !confident(right) || left.label === right.label) return;
  // A mão mais à esquerda no ecrã (já espelhado) é a esquerda do utilizador.
  state.votes.push(left.label === 'Right');
  if (state.votes.length > ORIENTATION_VOTES) state.votes.shift();
  const inv = state.votes.filter(Boolean).length;
  const ok = state.votes.length - inv;
  if (inv !== ok) state.labelsInverted = inv > ok;
}

/**
 * Atribui as mãos aos lados do utilizador.
 * - Duas mãos: pela posição x do pulso no ecrã (o mais fiável); servem também para aprender se
 *   os rótulos do MediaPipe vêm trocados.
 * - Uma mão: (a) pela lateralidade, se o rótulo for confiável; (b) senão, pelo lado que tinha
 *   no fotograma anterior, se o pulso quase não se mexeu; (c) senão, pelo lado do ecrã.
 * `state` guarda o que passa de um fotograma para o outro.
 */
export function assignHands(
  list: HandLandmarks[],
  handedness: readonly (Handedness | null | undefined)[] = [],
  state: HandAssignState = createHandAssignState(),
): AssignedHands {
  const out: AssignedHands = [null, null];
  if (list.length >= 2) {
    const [a, b] = [0, 1].sort((i, j) => list[i][0].x - list[j][0].x);
    out[0] = list[a];
    out[1] = list[b];
    learn(state, handedness[a] ?? null, handedness[b] ?? null);
  } else if (list.length === 1) {
    const hand = list[0];
    const h = handedness[0];
    let side: 0 | 1;
    if (confident(h)) {
      side = sideOfLabel(h, state.labelsInverted ?? DEFAULT_LABELS_INVERTED);
    } else {
      const w = hand[0];
      const d = state.prev.map((p) => (p ? Math.hypot(p.x - w.x, p.y - w.y) : Infinity));
      const near = d[0] <= d[1] ? 0 : 1;
      side = d[near] < CONTINUITY_DIST ? near : w.x < 0.5 ? 0 : 1;
    }
    out[side] = hand;
  }
  state.prev = [out[0]?.[0] ?? null, out[1]?.[0] ?? null];
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
  detect(
    video: HTMLVideoElement,
    now: number,
  ): { hands: HandLandmarks[]; handedness: (Handedness | null)[] } | null {
    if (!this.task || video.readyState < 2) return null;
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const r = this.task.detectForVideo(video, ts);
    return { hands: r.landmarks.map(mirror), handedness: toHandedness(r.handedness ?? []) };
  }

  close(): void {
    this.task?.close();
    this.task = null;
  }
}
