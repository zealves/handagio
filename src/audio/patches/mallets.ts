// Lâminas e sinos: marimba, vibrafone, kalimba, sinos, steel drum, copos de cristal.
import type { Patch } from './types';

export const mallets: Patch[] = [
  {
    id: 'marimba',
    name: 'Marimba',
    family: 'Lâminas',
    desc: 'Madeira, curta e seca.',
    rel: 0.2,
    len: 1,
    build(K, f, _vel, v) {
      K.osc('sine', f, K.out);
      const g2 = K.gain(0, K.out);
      K.osc('sine', f * 4, g2);
      K.hit(g2.gain, 0.5 * v, 0.002, 0.08);
      K.hit(K.out.gain, 0.6 * v, 0.003, 0.75);
    },
  },
  {
    id: 'vibes',
    name: 'Vibrafone',
    family: 'Lâminas',
    desc: 'Metal com tremolo, soa longo.',
    rel: 0.6,
    len: 3.5,
    build(K, f, _vel, v) {
      const tr = K.gain(1, K.out);
      K.osc('sine', f, tr);
      K.osc('sine', f * 4, K.gain(0.15, tr));
      K.lfo(5.5, 0.4, tr.gain);
      K.hit(K.out.gain, 0.35 * v, 0.003, 3.2);
    },
  },
  {
    id: 'kalimba',
    name: 'Kalimba',
    family: 'Lâminas',
    desc: 'Piano de polegar africano.',
    rel: 0.4,
    len: 1.8,
    build(K, f, _vel, v) {
      K.osc('sine', f, K.out);
      const g2 = K.gain(0, K.out);
      K.osc('sine', f * 5.3, g2);
      K.hit(g2.gain, 0.25 * v, 0.001, 0.12);
      const g3 = K.gain(0, K.out);
      K.osc('sine', f * 2.4, g3);
      K.hit(g3.gain, 0.1 * v, 0.001, 0.3);
      K.hit(K.out.gain, 0.5 * v, 0.002, 1.4);
    },
  },
  {
    id: 'bell',
    name: 'Sinos',
    family: 'Lâminas',
    desc: 'Metálico e longo, toca até ao fim.',
    ring: true,
    len: 3.6,
    build(K, f, vel, v) {
      const c = K.osc('sine', f, K.out);
      const mg = K.gain(0, c.frequency);
      K.osc('sine', f * 3.5, mg);
      mg.gain.setValueAtTime(f * (2 + vel * 4), K.t);
      mg.gain.exponentialRampToValueAtTime(f * 0.05, K.t + 2.5);
      K.hit(K.out.gain, 0.4 * v, 0.004, 3.3);
    },
  },
  {
    id: 'steel',
    name: 'Steel drum',
    family: 'Lâminas',
    desc: 'Tambor das Caraíbas.',
    rel: 0.3,
    len: 1.6,
    build(K, f, vel, v) {
      const c = K.osc('sine', f, K.out);
      const mg = K.gain(0, c.frequency);
      K.osc('sine', f * 2, mg);
      K.hit(mg.gain, f * (0.8 + vel), 0.002, 0.4);
      K.osc('sine', f * 3.01, K.gain(0.15, K.out));
      K.hit(K.out.gain, 0.45 * v, 0.004, 1.3);
    },
  },
  {
    id: 'glass',
    name: 'Copos de cristal',
    family: 'Lâminas',
    desc: 'Dedo molhado na borda: puro e etéreo.',
    sustain: true,
    rel: 0.8,
    build(K, f, _vel, v) {
      const o = K.osc('sine', f * 2, K.out);
      const o2 = K.osc('sine', f * 4.02, K.gain(0.2, K.out));
      K.lfo(0.8, 0.25, K.out.gain);
      K.adsr(K.out.gain, 0.22 * v, 0.5, 0.5, 0.9);
      return (fr) => {
        o.frequency.setTargetAtTime(fr * 2, K.ctx.currentTime, 0.1);
        o2.frequency.setTargetAtTime(fr * 4.02, K.ctx.currentTime, 0.1);
      };
    },
  },
];
