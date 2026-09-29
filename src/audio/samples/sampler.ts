// Voz com amostras gravadas: a amostra mais próxima, afinada por `playbackRate`, com a mesma
// interface `Voice` dos patches sintetizados.
//
//   fonte (buffer) → passa-baixo (brilho pela força) → ganho (ataque 5 ms) → pan → destino
import { freqToMidi } from '../theory';
import type { Voice } from '../voice';
import type { SampledDef } from './catalog';
import type { SampleEntry, SampleStatus } from './loader';
import { nearestSample, playbackRateFor, releaseTime } from './notes';

/** Amostras só com os buffers prontos; até lá (ou se falharem) toca o patch de reserva. */
export function chooseVoice(
  status: SampleStatus,
  def: SampledDef | undefined,
): 'sample' | 'fallback' {
  return def && status === 'ready' ? 'sample' : 'fallback';
}

/** Ciclo das notas sustentadas: entre 45% e 90% da parte com som (depois do silêncio inicial). */
export function loopPoints(duration: number, offset: number): { start: number; end: number } {
  const len = duration - offset;
  return { start: offset + 0.45 * len, end: offset + 0.9 * len };
}

export interface SampleVoice extends Voice {
  /**
   * Abafa a voz a partir de `at` com constante de tempo `tau`: a mesma chave voltou a tocar.
   * Nunca prolonga uma descida que já está a acontecer mais depressa.
   */
  choke(at: number, tau: number): void;
  /**
   * Se a voz ainda não começou (agendada pela quantização ou pelo looper), corta-a sem som e
   * devolve `true`; se já está a soar, não faz nada. Usado ao mudar de instrumento, oitava ou
   * escala: uma nota agendada com a afinação antiga não deve chegar a tocar. Ao largar um dedo
   * usa-se `release()`, que deixa ouvir o toque curto quantizado.
   */
  cancelIfPending(): boolean;
}

let sounding = 0;
/** Fontes de amostras ainda a soar (diagnóstico). */
export const sampleSources = (): number => sounding;

const ATTACK = 0.005;

/** Abafar quando a mesma chave volta a tocar: a mesma nota (corda tocada de novo) ou outra. */
export const CHOKE_SAME = 0.03;
export const CHOKE_OTHER = 0.25;

/** Ganho de pico da voz: normalização do manifest × ajuste do catálogo (dB) × força. */
export const samplePeak = (manifestGain: number, levelDb: number, vel: number): number =>
  manifestGain * 0.5 * Math.pow(10, levelDb / 20) * (0.15 + 0.85 * vel);

export function playSample(
  ctx: BaseAudioContext,
  entry: SampleEntry,
  def: SampledDef,
  dest: AudioNode,
  freq: number,
  vel: number,
  pan: number,
  when?: number,
): SampleVoice {
  const t = Math.max(when ?? 0, ctx.currentTime);
  const sampleMidi = nearestSample(freqToMidi(freq), entry.notes);
  const buffer = entry.buffers.get(sampleMidi)!;
  const offset = entry.offsets.get(sampleMidi) ?? 0;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = playbackRateFor(freqToMidi(freq), sampleMidi);
  if (def.kind === 'sustained') {
    const lp = loopPoints(buffer.duration, offset);
    src.loop = true;
    src.loopStart = lp.start;
    src.loopEnd = lp.end;
  }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1500 + vel * 12000;
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  // valor intrínseco a 0: se as automações forem canceladas antes do início, não há rajada a 1
  g.gain.value = 0;
  const peak = samplePeak(entry.gain, def.level, vel);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + ATTACK);
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  src.connect(lp);
  lp.connect(g);
  g.connect(p);
  p.connect(dest);
  // salta o silêncio do codificador: a nota soa logo
  src.start(t, offset);
  sounding++;

  let released = false;
  /** Descida já agendada (início e constante de tempo). */
  let fade: { at: number; tau: number } | null = null;
  const stop = (at: number) => {
    try {
      src.stop(at);
    } catch {
      /* já parado */
    }
  };
  const fadeOut = (at: number, tau: number) => {
    fade = { at, tau };
    if (at <= t) {
      // ainda não começou: cancela o ataque (o ganho fica no 0 intrínseco) e não chega a soar
      g.gain.cancelScheduledValues(ctx.currentTime);
      stop(t);
      return;
    }
    g.gain.cancelScheduledValues(at);
    g.gain.setTargetAtTime(0, at, tau);
    stop(at + tau * 6);
  };

  const voice: SampleVoice = {
    sustain: def.kind === 'sustained',
    startAt: t,
    done: false,
    setFreq(fr) {
      src.playbackRate.setTargetAtTime(
        playbackRateFor(freqToMidi(fr), sampleMidi),
        ctx.currentTime,
        0.04,
      );
    },
    release() {
      if (released) return;
      released = true;
      // beliscado: deixa a corda soar até ao fim da amostra
      if (def.kind === 'plucked') return;
      // um toque curto ainda deixa ouvir o instrumento (nunca antes de 250 ms)
      fadeOut(releaseTime(ctx.currentTime, t), def.rel);
    },
    choke(at, chokeTau) {
      released = true;
      // sustentados e percutidos: nunca mais lento do que a libertação do próprio instrumento
      const tau = def.kind === 'plucked' ? chokeTau : Math.min(chokeTau, def.rel);
      const a = Math.max(at, ctx.currentTime);
      if (fade && fade.at <= a && fade.tau <= tau) return;
      fadeOut(a, tau);
    },
    cancelIfPending() {
      if (ctx.currentTime >= t) return false;
      released = true;
      fadeOut(t, 0.01);
      return true;
    },
    kill() {
      released = true;
      const n = ctx.currentTime;
      if (n <= t) {
        fadeOut(n, 0.01);
        return;
      }
      fade = { at: n, tau: 0.01 };
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(0, n + 0.01);
      stop(n + 0.015);
    },
  };
  src.onended = () => {
    sounding--;
    for (const n of [src, lp, g, p]) n.disconnect();
    voice.done = true;
    voice.onDone?.();
  };
  return voice;
}
