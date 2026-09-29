// Funções de desenho partilhadas pelos visualizadores.
import { audio } from '../../audio/engine';
import { NEON } from '../theme';

export const hasAudio = (): boolean => audio.ready;

const WAVE_N = 96;
const WAVE_LINES = 4;
const WAVE_COLORS = [NEON.cyan, NEON.violet, NEON.magenta, NEON.blue];

/** Histórico das ondas: buffer circular pré-alocado (sem alocações por fotograma). */
export interface WaveRing {
  lines: Float32Array[];
  /** Índice da linha mais recente. */
  head: number;
}

export const createWaveRing = (): WaveRing => ({
  lines: Array.from({ length: WAVE_LINES }, () => new Float32Array(WAVE_N)),
  head: 0,
});

/**
 * Várias linhas de onda sobrepostas, cada uma com escala e fase próprias (analisador dinâmico).
 * Um traço simples por linha, sem `shadowBlur` (a operação mais cara do canvas 2D).
 */
export function drawWaves(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  ring: WaveRing,
): void {
  g.clearRect(0, 0, w, h);
  const N = WAVE_N;
  ring.head = (ring.head + 1) % WAVE_LINES;
  const cur = ring.lines[ring.head];
  if (audio.ready) {
    const wf = audio.analyser.waveform();
    const step = Math.floor(wf.length / N);
    for (let i = 0; i < N; i++) cur[i] = wf[i * step];
  } else cur.fill(0);
  g.lineWidth = 1.8;
  for (let k = 0; k < WAVE_LINES; k++) {
    const line = ring.lines[(ring.head - k + WAVE_LINES) % WAVE_LINES];
    g.strokeStyle = WAVE_COLORS[k];
    g.globalAlpha = 1 - k * 0.2;
    g.beginPath();
    for (let i = 0; i < N; i++) {
      const idle = Math.sin(now / 500 + i * 0.18 + k) * 0.05;
      const v = line[i] * (2.2 - k * 0.35) + idle;
      const x = (i / (N - 1)) * w;
      const y =
        h / 2 + v * h * 0.45 + Math.sin(i * 0.12 + k * 1.3 + now / 900) * h * 0.08 * (k + 1) * 0.4;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}
