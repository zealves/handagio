// Efeitos da boca, portados de buildFx()/applyMouth() do protótipo.
import type { MouthFxId } from '../../state/types';

interface Fx {
  duck: number;
  full?: boolean;
  set: (a: number, t: number) => void;
  wet?: GainNode;
}

export function createMouthFx(
  ctx: BaseAudioContext,
  input: AudioNode,
  output: AudioNode,
  dry: GainNode,
) {
  const fx = {} as Record<MouthFxId, Fx>;
  const wet = () => {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(output);
    return g;
  };
  // wah: banda ressonante que sobe com a boca
  {
    const w = wet();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.value = 400;
    const boost = ctx.createGain();
    boost.gain.value = 2.6;
    input.connect(bp);
    bp.connect(boost);
    boost.connect(w);
    fx.wah = {
      duck: 0.9,
      set: (a, t) => {
        bp.frequency.setTargetAtTime(350 + a * 2600, t, 0.03);
        w.gain.setTargetAtTime(a, t, 0.03);
      },
      wet: w,
    };
  }
  // filtro: substitui o seco; fechada = abafado
  {
    const w = wet();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 5;
    lp.frequency.value = 300;
    input.connect(lp);
    lp.connect(w);
    fx.filter = {
      duck: 1,
      full: true,
      set: (a, t) => {
        lp.frequency.setTargetAtTime(250 * Math.pow(40, a), t, 0.03);
        w.gain.setTargetAtTime(1, t, 0.03);
      },
      wet: w,
    };
  }
  // distorção
  {
    const w = wet();
    const ws = ctx.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = i / 512 - 1;
      c[i] = Math.tanh(x * 9);
    }
    ws.curve = c;
    ws.oversample = '2x';
    const pre = ctx.createGain();
    pre.gain.value = 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    const tr = ctx.createGain();
    tr.gain.value = 0.35;
    input.connect(pre);
    pre.connect(ws);
    ws.connect(lp);
    lp.connect(tr);
    tr.connect(w);
    fx.dist = {
      duck: 0.8,
      set: (a, t) => {
        pre.gain.setTargetAtTime(1 + a * 6, t, 0.03);
        w.gain.setTargetAtTime(a, t, 0.03);
      },
      wet: w,
    };
  }
  // eco espacial
  {
    const w = wet();
    const d = ctx.createDelay(2);
    const fb = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    d.delayTime.value = 0.28;
    fb.gain.value = 0.6;
    hp.type = 'highpass';
    hp.frequency.value = 300;
    input.connect(d);
    d.connect(hp);
    hp.connect(fb);
    fb.connect(d);
    hp.connect(w);
    fx.echo = {
      duck: 0,
      set: (a, t) => {
        w.gain.setTargetAtTime(a * 1.1, t, 0.05);
        fb.gain.setTargetAtTime(0.35 + a * 0.35, t, 0.05);
      },
      wet: w,
    };
  }
  // vibrato (atraso modulado)
  const lfos: OscillatorNode[] = [];
  {
    const w = wet();
    const d = ctx.createDelay(0.05);
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    d.delayTime.value = 0.008;
    lfo.frequency.value = 6;
    lg.gain.value = 0;
    lfo.connect(lg);
    lg.connect(d.delayTime);
    lfo.start();
    lfos.push(lfo);
    input.connect(d);
    d.connect(w);
    fx.vibrato = {
      duck: 1,
      full: true,
      set: (a, t) => {
        lg.gain.setTargetAtTime(a * 0.0045, t, 0.05);
        lfo.frequency.setTargetAtTime(4 + a * 4, t, 0.1);
        w.gain.setTargetAtTime(1, t, 0.03);
      },
      wet: w,
    };
  }
  // robô (modulação em anel)
  {
    const w = wet();
    const rm = ctx.createGain();
    const car = ctx.createOscillator();
    rm.gain.value = 0;
    car.type = 'sine';
    car.frequency.value = 55;
    car.connect(rm.gain);
    car.start();
    lfos.push(car);
    input.connect(rm);
    rm.connect(w);
    fx.robot = {
      duck: 0.9,
      set: (a, t) => {
        car.frequency.setTargetAtTime(40 + a * 260, t, 0.05);
        w.gain.setTargetAtTime(a * 1.4, t, 0.03);
      },
      wet: w,
    };
  }
  // tremolo
  {
    const w = wet();
    const tg = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    tg.gain.value = 0.5;
    lfo.frequency.value = 7;
    lg.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(tg.gain);
    lfo.start();
    lfos.push(lfo);
    input.connect(tg);
    tg.connect(w);
    fx.tremolo = {
      duck: 1,
      set: (a, t) => {
        lfo.frequency.setTargetAtTime(3 + a * 9, t, 0.1);
        w.gain.setTargetAtTime(a, t, 0.03);
      },
      wet: w,
    };
  }
  // expressão: o seco só passa com a boca aberta
  fx.swell = { duck: 1, set: () => {} };
  fx.off = { duck: 0, set: () => {} };

  return {
    /** Aplica a abertura da boca (0..1) ao efeito escolhido. Chamado a cada fotograma. */
    apply(a: number, key: MouthFxId, t: number) {
      (Object.entries(fx) as [MouthFxId, Fx][]).forEach(([k, f]) => {
        if (k !== key && f.wet) f.wet.gain.setTargetAtTime(0, t, 0.05);
      });
      const f = fx[key];
      f.set(a, t);
      const dryG = key === 'swell' ? a : f.full ? 0 : 1 - a * f.duck;
      dry.gain.setTargetAtTime(dryG, t, 0.03);
    },
    stop() {
      lfos.forEach((o) => o.stop());
    },
  };
}
