// Sopros: flauta, metais, coro, saxofone.
import type { Patch } from './types';

export const winds: Patch[] = [
  {
    id: 'flute',
    name: 'Flauta',
    family: 'Sopros',
    desc: 'Sopro com ar e vibrato suave.',
    sustain: true,
    rel: 0.12,
    build(K, f, _vel, v) {
      const o = K.osc('sine', f, K.out);
      const o2 = K.osc('triangle', f * 2, K.gain(0.12, K.out));
      const bp = K.filt('bandpass', f * 2, 2, K.gain(0.25, K.out));
      K.noise(bp, true);
      const l = K.lfo(5, f * 0.006, o.frequency);
      l.g.connect(o2.frequency);
      K.adsr(K.out.gain, 0.28 * v, 0.07, 0.2, 0.8);
      return (fr) => {
        o.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.05);
        o2.frequency.setTargetAtTime(fr * 2, K.ctx.currentTime, 0.05);
        bp.frequency.setTargetAtTime(fr * 2, K.ctx.currentTime, 0.05);
      };
    },
  },
  {
    id: 'brass',
    name: 'Metais',
    family: 'Sopros',
    desc: 'Trompete: abre o som com a força.',
    sustain: true,
    rel: 0.1,
    build(K, f, vel, v) {
      const lp = K.filt('lowpass', 400, 1, K.out);
      lp.frequency.linearRampToValueAtTime(900 + vel * 3500, K.t + 0.08);
      lp.frequency.setTargetAtTime(700 + vel * 2000, K.t + 0.1, 0.2);
      const o1 = K.osc('sawtooth', f, lp);
      const o2 = K.osc('sawtooth', f, lp, 5);
      K.lfo(5.5, f * 0.004, o1.frequency);
      K.adsr(K.out.gain, 0.2 * v, 0.04, 0.2, 0.8);
      return (fr) => {
        o1.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.05);
        o2.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.05);
      };
    },
  },
  {
    id: 'choir',
    name: 'Coro',
    family: 'Sopros',
    desc: 'Vozes em "aah", entra devagar.',
    sustain: true,
    rel: 0.5,
    build(K, f, _vel, v) {
      const out = K.gain(1, K.out);
      const f1 = K.filt('bandpass', 800, 5, out);
      const f2 = K.filt('bandpass', 1150, 6, out);
      const f3 = K.filt('bandpass', 2900, 8, K.gain(0.4, out));
      const mix = K.gain(1, f1);
      mix.connect(f2);
      mix.connect(f3);
      const os = [-10, 0, 9, 15].map((dt) => K.osc('sawtooth', f, mix, dt));
      K.lfo(4.8, f * 0.005, os[0].frequency);
      K.adsr(K.out.gain, 0.5 * v, 0.35, 0.4, 0.9);
      return (fr) => os.forEach((o) => o.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.08));
    },
  },
  {
    id: 'sax',
    name: 'Saxofone',
    family: 'Sopros',
    desc: 'Rouco e expressivo.',
    sustain: true,
    rel: 0.1,
    build(K, f, vel, v) {
      const ws = K.track(K.ctx.createWaveShaper());
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = i / 128 - 1;
        c[i] = Math.tanh(x * 3);
      }
      ws.curve = c;
      const lp = K.filt('lowpass', 1800 + vel * 2000, 1.5, K.out);
      ws.connect(lp);
      const o = K.osc('square', f, K.gain(0.6, ws));
      const o2 = K.osc('sawtooth', f, K.gain(0.4, ws), 4);
      const bp = K.filt('bandpass', f * 3, 3, K.gain(0.08, K.out));
      K.noise(bp, true);
      K.lfo(5.2, f * 0.007, o.frequency);
      K.adsr(K.out.gain, 0.14 * v, 0.05, 0.2, 0.8);
      return (fr) => {
        o.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.05);
        o2.frequency.setTargetAtTime(fr, K.ctx.currentTime, 0.05);
      };
    },
  },
];
