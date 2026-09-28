// Sintetizadores: lead, pad, 8-bit, wobble, laser e theremin (contínuo).
import type { Patch } from './types';

export const synths: Patch[] = [
  {
    id: 'synth',
    name: 'Lead',
    family: 'Sintetizadores',
    desc: 'Dente de serra com filtro que abre.',
    sustain: true,
    rel: 0.15,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 300, 6, K.out);
      lp.frequency.exponentialRampToValueAtTime(800 + vel * 6000, K.t + 0.08);
      lp.frequency.exponentialRampToValueAtTime(600 + vel * 1800, K.t + 0.6);
      const o1 = K.osc('sawtooth', f, lp);
      const o2 = K.osc('sawtooth', f, lp, 12);
      K.adsr(K.out.gain, 0.2 * v, 0.01, 0.3, 0.7);
      return (fr) => {
        o1.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.04);
        o2.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.04);
      };
    },
  },
  {
    id: 'pad',
    name: 'Pad',
    family: 'Sintetizadores',
    desc: 'Nuvem larga e lenta.',
    sustain: true,
    rel: 1,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 900 + vel * 1200, 1, K.out);
      const os = [-14, -5, 0, 6, 13].map((dt) => K.osc('sawtooth', f, lp, dt));
      os.push(K.osc('sine', f / 2, K.gain(0.8, K.out)));
      K.lfo(0.25, 500, lp.frequency);
      K.adsr(K.out.gain, 0.1 * v, 0.6, 0.5, 0.9);
      return (fr) =>
        os.forEach((o, k) =>
          o.frequency.setTargetAtTime(k === 5 ? fr / 2 : fr, K.ctx.currentTime, 0.1),
        );
    },
  },
  {
    id: 'chip',
    name: '8-bit',
    family: 'Sintetizadores',
    desc: 'Consola antiga, com arpejo.',
    sustain: true,
    rel: 0.04,
    build(K, f, _vel, v) {
      const o = K.osc('square', f, K.out);
      const steps = [1, 1.26, 1.5, 2];
      let base = f;
      const id = setInterval(() => {
        const k = Math.floor(K.ctx.currentTime * 16) % 4;
        o.frequency.setValueAtTime(base * steps[k], K.ctx.currentTime);
      }, 30);
      K.onStop = () => clearInterval(id);
      K.adsr(K.out.gain, 0.1 * v, 0.005, 0.1, 0.8);
      return (fr) => {
        base = fr;
      };
    },
  },
  {
    id: 'wobble',
    name: 'Wobble',
    family: 'Sintetizadores',
    desc: 'Baixo dubstep; a força acelera o wobble.',
    sustain: true,
    rel: 0.08,
    build(K, f, vel, v) {
      f /= 2;
      const lp = K.filt('lowpass', 600, 8, K.out);
      const o1 = K.osc('sawtooth', f, lp);
      const o2 = K.osc('square', f / 2, K.gain(0.5, lp));
      K.lfo(2 + vel * 8, 1200, lp.frequency);
      K.adsr(K.out.gain, 0.25 * v, 0.01, 0.1, 0.9);
      return (fr) => {
        fr /= 2;
        o1.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.04);
        o2.frequency.setTargetAtTime(fr / 2, K.ctx.currentTime, 0.04);
      };
    },
  },
  {
    id: 'laser',
    name: 'Laser',
    family: 'Sintetizadores',
    desc: 'Varrimento de ficção científica.',
    rel: 0.1,
    len: 0.6,
    build(K, f, vel, v) {
      const o = K.osc('sawtooth', f * 8, K.filt('lowpass', 5000, 2, K.out));
      o.frequency.exponentialRampToValueAtTime(f, K.t + 0.12 + (1 - vel) * 0.3);
      K.hit(K.out.gain, 0.2 * v, 0.003, 0.5);
    },
  },
  {
    id: 'theremin',
    name: 'Theremin',
    family: 'Sintetizadores',
    desc: 'Contínuo: dobrar o dedo aumenta o volume, a altura desliza o tom.',
    continuous: true,
  },
];
