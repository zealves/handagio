import { useRef } from 'react';
import { audio } from '../../audio/engine';
import { useCanvas } from '../frame';
import { NEON } from '../theme';
import { drawBars, drawWaves, RAINBOW, spectrumBars } from './draw';
import { Panel } from './Panel';
import s from './panels.module.css';

function grid(g: CanvasRenderingContext2D, w: number, h: number) {
  g.strokeStyle = 'rgba(140,170,255,.08)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= w; x += w / 8) {
    g.moveTo(x, 0);
    g.lineTo(x, h);
  }
  for (let y = 0; y <= h; y += h / 4) {
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();
}

export function VisualizerPanel() {
  const vals = useRef(new Float32Array(48));
  const spec = useCanvas((g, w, h, now) =>
    drawBars(g, w, h, spectrumBars(48, vals.current), RAINBOW, now),
  );

  // Analisador dinâmico: várias linhas de onda sobrepostas, cada uma com escala e fase próprias.
  const hist = useRef<Float32Array[]>([]);
  const multi = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, hist.current));

  // Osciloscópio: traço disparado no cruzamento por zero, com rasto.
  const scope = useCanvas((g, w, h) => {
    g.fillStyle = 'rgba(6,10,22,.35)';
    g.fillRect(0, 0, w, h);
    grid(g, w, h);
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, NEON.cyan);
    grad.addColorStop(1, NEON.magenta);
    g.strokeStyle = grad;
    g.lineWidth = 2;
    g.shadowColor = NEON.cyan;
    g.shadowBlur = 8;
    g.beginPath();
    if (audio.ready) {
      const wf = audio.analyser.waveform();
      let start = 0;
      for (let i = 1; i < wf.length / 2; i++)
        if (wf[i - 1] < 0 && wf[i] >= 0) {
          start = i;
          break;
        }
      const span = 600;
      for (let i = 0; i < span; i++) {
        const x = (i / (span - 1)) * w;
        const y = h / 2 - wf[start + i] * h * 0.9;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
    } else {
      g.moveTo(0, h / 2);
      g.lineTo(w, h / 2);
    }
    g.stroke();
    g.shadowBlur = 0;
  });

  return (
    <Panel title="Visualizador">
      <div className={s.stack}>
        <canvas ref={spec} className={s.canvas} role="img" aria-label="Barras de espectro" />
        <div>
          <h3 className={s.sub}>Analisador dinâmico</h3>
          <canvas
            ref={multi}
            className={s.canvasSm}
            role="img"
            aria-label="Linhas de onda sobrepostas"
          />
        </div>
        <div>
          <h3 className={s.sub}>Osciloscópio dinâmico</h3>
          <canvas ref={scope} className={s.canvasSm} role="img" aria-label="Osciloscópio" />
        </div>
      </div>
    </Panel>
  );
}
