// Teclas: piano, piano elétrico, órgão, cravo, caixa de música.
import type { Patch } from './types';

export const keys: Patch[] = [
  {
    id: 'piano',
    name: 'Piano',
    family: 'Teclas',
    desc: 'Ataque suave que decai; a força abre o brilho.',
    rel: 0.25,
    len: 2.4,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 1200 + vel * 5000, 0.7, K.out);
      K.osc('triangle', f, lp);
      K.osc('sine', f * 2, K.gain(0.3, lp));
      K.osc('sine', f * 3, K.gain(0.08 * vel, lp));
      K.hit(K.out.gain, 0.5 * v, 0.006, 1.9);
    },
  },
  {
    id: 'epiano',
    name: 'Piano elétrico',
    family: 'Teclas',
    desc: 'Timbre de Rhodes com sino na ponta.',
    rel: 0.3,
    len: 2.6,
    build(K, f, vel, v) {
      const c = K.osc('sine', f, K.out);
      const mg = K.gain(0, c.frequency);
      K.osc('sine', f, mg);
      K.hit(mg.gain, f * (0.6 + vel * 2.2), 0.004, 1.2);
      const tg = K.gain(0, K.out);
      K.osc('sine', f * 14, tg);
      K.hit(tg.gain, 0.05 * v, 0.002, 0.12);
      K.lfo(4.5, 0.15 * v, K.out.gain);
      K.hit(K.out.gain, 0.45 * v, 0.004, 2.2);
    },
  },
  {
    id: 'organ',
    name: 'Órgão',
    family: 'Teclas',
    desc: 'Sustenta enquanto seguras o dedo.',
    sustain: true,
    rel: 0.08,
    build(K, f, _vel, v) {
      const hs = [1, 2, 3, 4, 6];
      const gs = [1, 0.6, 0.35, 0.25, 0.15];
      const os = hs.map((h, k) => K.osc('sine', f * h, K.gain(gs[k], K.out)));
      const l = K.lfo(5.5, f * 0.004, os[0].frequency);
      os.slice(1).forEach((o) => l.g.connect(o.frequency));
      K.adsr(K.out.gain, 0.09 * v, 0.03, 0.1, 1);
      return (fr) =>
        os.forEach((o, k) => o.frequency.setTargetAtTime(fr * hs[k], K.ctx.currentTime, 0.04));
    },
  },
  {
    id: 'harpsichord',
    name: 'Cravo',
    family: 'Teclas',
    desc: 'Corda beliscada, muito brilhante.',
    rel: 0.12,
    len: 1.6,
    build(K, f, _vel, v) {
      const hp = K.filt('highpass', f * 0.9, 0.7, K.out);
      K.buffer(K.ks(f, 0.994, 1.6, true), hp);
      K.buffer(K.ks(f * 2, 0.992, 1.2, true), K.gain(0.4, hp));
      K.out.gain.value = 0.55 * v;
    },
  },
  {
    id: 'musicbox',
    name: 'Caixa de música',
    family: 'Teclas',
    desc: 'Pentes metálicos pequenos e delicados.',
    rel: 0.5,
    len: 2,
    build(K, f, _vel, v) {
      K.osc('sine', f * 2, K.out);
      K.osc('sine', f * 5.4, K.gain(0.2, K.out));
      K.osc('sine', f * 8.9, K.gain(0.08, K.out));
      K.hit(K.out.gain, 0.3 * v, 0.002, 1.6);
    },
  },
];
