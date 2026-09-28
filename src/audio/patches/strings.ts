// Cordas: guitarra, harpa, violino, violoncelo, baixo.
import type { Patch } from './types';

export const strings: Patch[] = [
  {
    id: 'pluck',
    name: 'Guitarra',
    family: 'Cordas',
    desc: 'Dedilhado de corda de nylon.',
    rel: 0.35,
    len: 2.2,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 1500 + vel * 6000, 0.7, K.out);
      K.buffer(K.ks(f, 0.996, 2.2, false), lp);
      K.out.gain.value = 0.8 * v;
    },
  },
  {
    id: 'harp',
    name: 'Harpa',
    family: 'Cordas',
    desc: 'Cordas longas e redondas.',
    rel: 0.8,
    len: 3.5,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 900 + vel * 2500, 0.5, K.out);
      K.buffer(K.ks(f, 0.9985, 3.5, false), lp);
      K.out.gain.value = 0.7 * v;
    },
  },
  {
    id: 'violin',
    name: 'Violino',
    family: 'Cordas',
    desc: 'Arco: ataque lento e vibrato que cresce.',
    sustain: true,
    rel: 0.18,
    build(K, f, vel, v) {
      const bp = K.filt('lowpass', 2600 + vel * 1500, 1.2, K.out);
      const pk = K.filt('peaking', 900, 1, bp);
      pk.gain.value = 6;
      const o1 = K.osc('sawtooth', f, pk);
      const o2 = K.osc('sawtooth', f, pk, 7);
      const l = K.lfo(5.8, 0, o1.frequency);
      l.g.connect(o2.frequency);
      l.g.gain.setValueAtTime(0, K.t);
      l.g.gain.linearRampToValueAtTime(f * 0.012, K.t + 0.6);
      K.adsr(K.out.gain, 0.16 * v, 0.12 + (1 - vel) * 0.15, 0.3, 0.85);
      return (fr) => {
        o1.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.06);
        o2.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.06);
      };
    },
  },
  {
    id: 'cello',
    name: 'Violoncelo',
    family: 'Cordas',
    desc: 'Como o violino, uma oitava abaixo e mais quente.',
    sustain: true,
    rel: 0.25,
    build(K, f, vel, v) {
      f /= 2;
      const lp = K.filt('lowpass', 1400 + vel * 900, 1, K.out);
      const o1 = K.osc('sawtooth', f, lp);
      const o2 = K.osc('sawtooth', f, lp, -6);
      const l = K.lfo(5, 0, o1.frequency);
      l.g.connect(o2.frequency);
      l.g.gain.linearRampToValueAtTime(f * 0.01, K.t + 0.7);
      K.adsr(K.out.gain, 0.2 * v, 0.18, 0.3, 0.85);
      return (fr) => {
        fr /= 2;
        o1.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.06);
        o2.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.06);
      };
    },
  },
  {
    id: 'bass',
    name: 'Baixo',
    family: 'Cordas',
    desc: 'Baixo elétrico grave e redondo.',
    rel: 0.12,
    len: 1.8,
    build(K, f, vel, v) {
      f /= 2;
      const lp = K.filt('lowpass', 300 + vel * 900, 2, K.out);
      lp.frequency.setValueAtTime(300 + vel * 1800, K.t);
      lp.frequency.exponentialRampToValueAtTime(250, K.t + 0.5);
      K.osc('sawtooth', f, lp);
      K.osc('sine', f / 2, K.gain(0.7, K.out));
      K.hit(K.out.gain, 0.45 * v, 0.005, 1.6);
    },
  },
];
