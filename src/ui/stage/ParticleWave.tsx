// Onda de partículas na parte inferior do palco: uma fita que ondula com a forma de onda do
// analisador e dispara partículas a partir de cada nota tocada. Desligada com reduced-motion.
import { useEffect, useRef } from 'react';
import { audio } from '../../audio/engine';
import { live } from '../../state/live';
import { stageCanvases } from '../../state/stageCanvases';
import { useCanvas } from '../frame';
import { NEON, prefersReducedMotion } from '../theme';

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  r: number;
}

const COLS = 140;
const MAX_P = 500;

export function ParticleWave() {
  const reduced = useRef(prefersReducedMotion());
  const parts = useRef<P[]>([]);
  const seen = useRef(0);
  const smooth = useRef(new Float32Array(COLS));

  const ref = useCanvas((g, w, h, now, dt) => {
    g.clearRect(0, 0, w, h);
    if (reduced.current) return;
    const base = h * 0.8;
    const amp = h * 0.12;
    const sm = smooth.current;
    let level = 0;
    if (audio.ready) {
      const wf = audio.analyser.waveform();
      const step = Math.floor(wf.length / COLS);
      for (let i = 0; i < COLS; i++) sm[i] = sm[i] * 0.7 + wf[i * step] * 0.3;
      level = Math.min(1, audio.analyser.level() * 4);
    }

    // fita: três fios de partículas com gradiente ciano → magenta
    g.globalCompositeOperation = 'lighter';
    for (let strand = 0; strand < 3; strand++) {
      const off = strand * 1.7;
      for (let i = 0; i < COLS; i++) {
        const t = i / (COLS - 1);
        const x = t * w;
        const wave =
          Math.sin(t * 7 + now / 700 + off) * amp * (0.35 + level * 0.6) +
          Math.sin(t * 17 - now / 450 + off) * amp * 0.18 +
          sm[i] * amp * 3.2;
        const y = base + wave + (strand - 1) * 6;
        const hue = t < 0.5 ? NEON.cyan : NEON.magenta;
        g.fillStyle = t < 0.33 ? NEON.cyan : t < 0.66 ? NEON.violet : hue;
        g.globalAlpha = 0.25 + 0.35 * (1 - Math.abs(strand - 1) * 0.5) + level * 0.3;
        const r = 1.1 + (strand === 1 ? 0.8 : 0) + level * 1.2;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }

    // partículas novas a partir de cada disparo
    for (const b of live.bursts) {
      if (b.t <= seen.current) continue;
      seen.current = b.t;
      const n = 18 + Math.round(b.strength * 26);
      for (let k = 0; k < n && parts.current.length < MAX_P; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 160 * (0.5 + b.strength);
        parts.current.push({
          x: b.x * w,
          y: Math.min(b.y * h, base),
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 60,
          life: 1,
          color: b.color,
          r: 1 + Math.random() * 2.2,
        });
      }
      // uma coluna de brilho da fita até à nota
      for (let k = 0; k < 10 && parts.current.length < MAX_P; k++)
        parts.current.push({
          x: b.x * w + (Math.random() - 0.5) * 14,
          y: base,
          vx: (Math.random() - 0.5) * 20,
          vy: -120 - Math.random() * 160,
          life: 1,
          color: b.color,
          r: 1.4,
        });
    }
    const ps = parts.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt * 0.9;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy += 60 * dt;
      p.vx *= 0.985;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      g.globalAlpha = p.life;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.r * (0.6 + p.life * 0.6), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }, { always: true });
  useEffect(() => {
    const cv = ref.current;
    stageCanvases.particles = cv;
    return () => {
      if (stageCanvases.particles === cv) stageCanvases.particles = null;
    };
  }, [ref]);
  return <canvas ref={ref} aria-hidden style={{ pointerEvents: 'none' }} />;
}
