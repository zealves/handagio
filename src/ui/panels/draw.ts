// Funções de desenho partilhadas pelos visualizadores.
import { audio } from '../../audio/engine';

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
