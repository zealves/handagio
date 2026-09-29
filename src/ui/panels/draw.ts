// Funções de desenho partilhadas pelos visualizadores.
import { audio } from '../../audio/engine';
import { NEON } from '../theme';

export const hasAudio = (): boolean => audio.ready;

/** Espectro em escala logarítmica, reduzido a `n` barras (0..1). */
export function spectrumBars(n: number, out: Float32Array): Float32Array {
  if (!audio.ready) {
    out.fill(0);
    return out;
  }
  const f = audio.analyser.frequency();
  const nyq = audio.ctx.sampleRate / 2;
  const bin = nyq / f.length;
  const lo = Math.log(40);
  const hi = Math.log(16000);
  for (let i = 0; i < n; i++) {
    const a = Math.exp(lo + ((hi - lo) * i) / n);
    const b = Math.exp(lo + ((hi - lo) * (i + 1)) / n);
    const i0 = Math.floor(a / bin);
    const i1 = Math.max(i0 + 1, Math.floor(b / bin));
    let m = 0;
    for (let k = i0; k < i1 && k < f.length; k++) m = Math.max(m, f[k]);
    out[i] = m / 255;
  }
  return out;
}

/** Barras com gradiente horizontal; `idle` desenha uma ondulação suave quando não há som. */
export function drawBars(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  vals: Float32Array,
  stops: string[],
  now: number,
) {
  g.clearRect(0, 0, w, h);
  const n = vals.length;
  const bw = w / n;
  const grad = g.createLinearGradient(0, 0, w, 0);
  stops.forEach((c, k) => grad.addColorStop(k / (stops.length - 1), c));
  g.fillStyle = grad;
  for (let i = 0; i < n; i++) {
    const idle = 0.04 + 0.03 * Math.sin(now / 600 + i * 0.4);
    const v = Math.max(vals[i], idle);
    const bh = Math.max(2, v * h * 0.95);
    g.fillRect(i * bw + bw * 0.18, h - bh, bw * 0.64, bh);
  }
}

export const RAINBOW = ['#35e0ff', '#3d7bff', '#8b5cff', '#ff4fd8', '#ff9f5c', '#ffd166'];
export const NEON_GRAD = ['#35e0ff', '#3d7bff', '#8b5cff', '#ff4fd8'];

/** Várias linhas de onda sobrepostas, cada uma com escala e fase próprias (analisador dinâmico). */
export function drawWaves(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  hist: Float32Array[],
): void {
  g.clearRect(0, 0, w, h);
  const N = 96;
  const cur = new Float32Array(N);
  if (audio.ready) {
    const wf = audio.analyser.waveform();
    const step = Math.floor(wf.length / N);
    for (let i = 0; i < N; i++) cur[i] = wf[i * step];
  }
  hist.unshift(cur);
  if (hist.length > 4) hist.pop();
  const colors = [NEON.cyan, NEON.violet, NEON.magenta, NEON.blue];
  g.lineWidth = 1.6;
  g.shadowBlur = 6;
  hist.forEach((line, k) => {
    g.strokeStyle = colors[k];
    g.shadowColor = colors[k];
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
  });
  g.globalAlpha = 1;
  g.shadowBlur = 0;
}
