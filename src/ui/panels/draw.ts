// Funções de desenho partilhadas pelos visualizadores.
import { audio } from '../../audio/engine';
import { NEON } from '../theme';

export const hasAudio = (): boolean => audio.ready;

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
