// Forma de onda estilo gravador: histórico dos picos a correr da direita para a esquerda,
// espelhado, com gradiente multicolor.
import { useRef } from 'react';
import { audio } from '../../audio/engine';
import { useCanvas } from '../frame';
import s from './bottom.module.css';

const N = 90;

export function WaveformStrip() {
  const hist = useRef(new Float32Array(N));
  const acc = useRef(0);
  const ref = useCanvas((g, w, h, now, dt) => {
    const hs = hist.current;
    acc.current += dt;
    if (acc.current > 1 / 30) {
      acc.current = 0;
      let peak = 0;
      if (audio.ready) {
        const wf = audio.analyser.waveform();
        for (let i = 0; i < wf.length; i += 8) peak = Math.max(peak, Math.abs(wf[i]));
      }
      hs.copyWithin(0, 1);
      hs[N - 1] = Math.min(1, peak * 1.6);
    }
    g.clearRect(0, 0, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    ['#35e0ff', '#3d7bff', '#8b5cff', '#ff4fd8', '#ff9f5c'].forEach((c, k, a) =>
      grad.addColorStop(k / (a.length - 1), c),
    );
    g.fillStyle = grad;
    const pad = 12;
    const bw = (w - pad * 2) / N;
    for (let i = 0; i < N; i++) {
      const idle = 0.03 + 0.02 * Math.sin(now / 400 + i * 0.5);
      const v = Math.max(hs[i], idle);
      const bh = v * (h * 0.45);
      g.globalAlpha = 0.35 + 0.65 * (i / N);
      g.fillRect(pad + i * bw, h / 2 - bh, Math.max(1, bw * 0.6), bh * 2);
    }
    g.globalAlpha = 1;
  });
  return (
    <div className={s.wave}>
      <canvas ref={ref} role="img" aria-label="Forma de onda do que está a tocar" />
    </div>
  );
}
