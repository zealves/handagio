// Construção de vozes: cada patch recebe um "kit" de funções auxiliares. Portado de kit() e
// playVoice() do protótipo, com uma diferença: todos os nós criados são registados e desligados
// quando a voz termina, e os intervalos (arpejo 8-bit) limpam-se no stop.
import type { Kit, Patch } from './patches/types';

export interface VoiceDeps {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  ks: Kit['ks'];
}

export interface Voice {
  setFreq(fr: number): void;
  release(): void;
  /** Corte imediato (mudança de instrumento, parar tudo). */
  kill(): void;
  readonly sustain: boolean;
  readonly startAt: number;
  done: boolean;
  onDone?: () => void;
}

export function makeKit(deps: VoiceDeps, t: number, out: GainNode) {
  const { ctx } = deps;
  const sources: AudioScheduledSourceNode[] = [];
  const all: AudioNode[] = [];
  /** LFOs que modulam o ganho de saída: têm de se calar no largar (senão a nota continua). */
  const gainLfos: GainNode[] = [];
  const K: Kit = {
    ctx,
    t,
    out,
    osc(type, f, dest, detune) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      if (detune) o.detune.value = detune;
      o.connect(dest as AudioNode);
      o.start(t);
      sources.push(o);
      all.push(o);
      return o;
    },
    gain(v, dest) {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(dest as AudioNode);
      all.push(g);
      return g;
    },
    filt(type, f, q, dest) {
      const x = ctx.createBiquadFilter();
      x.type = type;
      x.frequency.value = f;
      x.Q.value = q || 0.7;
      x.connect(dest);
      all.push(x);
      return x;
    },
    noise(dest, loop) {
      const s = ctx.createBufferSource();
      s.buffer = deps.noise;
      s.loop = !!loop;
      s.connect(dest);
      s.start(t);
      sources.push(s);
      all.push(s);
      return s;
    },
    buffer(buf, dest) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.connect(dest);
      s.start(t);
      sources.push(s);
      all.push(s);
      return s;
    },
    hit(param, peak, a, dec) {
      param.setValueAtTime(0.0001, t);
      param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      param.exponentialRampToValueAtTime(0.0001, t + a + dec);
    },
    adsr(param, peak, a, d, s) {
      param.setValueAtTime(0, t);
      param.linearRampToValueAtTime(peak, t + a);
      param.setTargetAtTime(peak * s, t + a, d / 3);
    },
    lfo(rate, depth, param) {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g);
      g.connect(param);
      o.start(t);
      sources.push(o);
      all.push(o, g);
      if (param === out.gain) gainLfos.push(g);
      return { o, g };
    },
    ks: deps.ks,
    track(n) {
      all.push(n);
      return n;
    },
  };
  return { K, sources, all, gainLfos };
}

/** Uma voz largada antes de começar (quantização) ainda soa este tempo (s) antes de largar. */
export const PENDING_HOLD = 0.12;

/** Toca uma voz melódica. `when` permite agendar (quantização, looper). */
export function playVoice(
  deps: VoiceDeps,
  patch: Patch,
  dest: AudioNode,
  freq: number,
  vel: number,
  pan: number,
  when?: number,
): Voice {
  const { ctx } = deps;
  const t = Math.max(when ?? 0, ctx.currentTime);
  const out = ctx.createGain();
  out.gain.value = 0;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  out.connect(p);
  p.connect(dest);
  const { K, sources, all, gainLfos } = makeKit(deps, t, out);
  all.push(out, p);
  const v = 0.15 + 0.85 * vel;
  const setFreq = patch.build?.(K, freq, vel, v) || (() => {});

  let cleanup: ReturnType<typeof setTimeout> | null = null;
  let released = false;
  const voice: Voice = {
    setFreq,
    sustain: !!patch.sustain,
    startAt: t,
    done: false,
    release() {
      if (released) return;
      released = true;
      if (patch.ring) return;
      const n = ctx.currentTime;
      const r = patch.rel || 0.2;
      if (n < t) {
        // largada antes de começar (quantização): em vez de cancelar o ataque e ficar muda, soa
        // um toque curto, como nas amostras (decisão 57)
        const at = t + PENDING_HOLD;
        out.gain.cancelScheduledValues(at);
        out.gain.setTargetAtTime(0, at, r);
        silenceLfos(at, r / 2, false);
        end(at + r * 6 + 0.05);
        return;
      }
      out.gain.cancelScheduledValues(n);
      out.gain.setValueAtTime(out.gain.value, n);
      out.gain.setTargetAtTime(0, n, r);
      silenceLfos(n, r / 2);
      end(n + r * 6 + 0.05);
    },
    kill() {
      released = true;
      const n = ctx.currentTime;
      out.gain.cancelScheduledValues(n);
      out.gain.setValueAtTime(out.gain.value, n);
      out.gain.setTargetAtTime(0, n, 0.01);
      silenceLfos(n, 0.005);
      end(n + 0.06);
    },
  };
  // Desvio consciente do protótipo: lá, o LFO ligado a `out.gain` (copos de cristal, piano
  // elétrico) continuava a modular depois do largar e a nota soava até ~5 s, com tremolo.
  function silenceLfos(n: number, tau: number, fromNow = true) {
    for (const g of gainLfos) {
      g.gain.cancelScheduledValues(n);
      if (fromNow) g.gain.setValueAtTime(g.gain.value, n);
      g.gain.setTargetAtTime(0, n, tau);
    }
  }
  function end(at: number) {
    for (const s of sources) {
      try {
        s.stop(at);
      } catch {
        /* já parado */
      }
    }
    if (cleanup) clearTimeout(cleanup);
    cleanup = setTimeout(
      () => {
        K.onStop?.();
        for (const n of all) n.disconnect();
        voice.done = true;
        voice.onDone?.();
      },
      Math.max(0, (at - ctx.currentTime) * 1000) + 80,
    );
  }
  if (!patch.sustain) end(t + (patch.len || 2));
  return voice;
}
