// Relógio musical com agendamento antecipado (padrão "A Tale of Two Clocks"): um temporizador
// JS acorda a cada 25 ms e agenda no relógio do AudioContext todos os passos (semicolcheias)
// que caiam nos próximos 100 ms. Metrónomo, quantização e looper usam este relógio.
import { Emitter } from '../lib/emitter';
import type { Quantize } from '../state/types';

export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;
export const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;

export const secondsPerBeat = (bpm: number): number => 60 / bpm;
export const clampBpm = (bpm: number): number => Math.max(60, Math.min(180, Math.round(bpm)));

/**
 * Próximo ponto da grelha (1/8 ou 1/16) a partir de `now`. Se `now` acabou de passar um ponto
 * (menos de `tol` segundos), toca já, para não atrasar um compasso inteiro por um triz.
 */
export function quantizeTime(
  now: number,
  anchor: number,
  bpm: number,
  q: Quantize,
  tol = 0.012,
): number {
  if (q === 'off') return now;
  const div = q === '1/8' ? 2 : 4; // subdivisões por tempo
  const step = secondsPerBeat(bpm) / div;
  const rel = (now - anchor) / step;
  const prev = Math.floor(rel);
  if ((rel - prev) * step <= tol) return now;
  return anchor + (prev + 1) * step;
}

export interface ClockEvents extends Record<string, unknown> {
  /** Um passo (semicolcheia) agendado para `time` (relógio do AudioContext). */
  step: { step: number; time: number; bpm: number };
}

export interface ClockDeps {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
}

export class Clock extends Emitter<ClockEvents> {
  bpm = 120;
  /** Tempo (AudioContext) do passo 0; muda quando o BPM muda, para manter a fase. */
  anchor = 0;
  private nextStep = 0;
  private nextTime = 0;
  private timer: unknown = null;
  readonly lookahead = 0.1;
  readonly interval = 25;

  constructor(private deps: ClockDeps) {
    super();
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(): void {
    if (this.running) return;
    const t = this.deps.now() + 0.05;
    this.anchor = t;
    this.nextStep = 0;
    this.nextTime = t;
    this.timer = this.deps.setInterval(() => this.schedule(), this.interval);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) this.deps.clearInterval(this.timer);
    this.timer = null;
  }

  get stepDur(): number {
    return secondsPerBeat(this.bpm) / STEPS_PER_BEAT;
  }

  setBpm(bpm: number): void {
    const b = clampBpm(bpm);
    if (b === this.bpm) return;
    // Mantém o próximo passo onde está e recalcula a âncora para a nova duração.
    this.bpm = b;
    this.anchor = this.nextTime - this.nextStep * this.stepDur;
  }

  /** Tempo do próximo passo ainda por agendar: os passos antes dele já foram emitidos. */
  get scheduledUntil(): number {
    return this.nextTime;
  }

  /** Posição atual em passos (fracionária). */
  positionAt(t: number): number {
    return (t - this.anchor) / this.stepDur;
  }

  /** Tempo do início do próximo compasso a partir de `t`. */
  nextBarTime(t: number): { time: number; step: number } {
    const step = Math.ceil(this.positionAt(t) / STEPS_PER_BAR - 1e-6) * STEPS_PER_BAR;
    return { time: this.anchor + step * this.stepDur, step };
  }

  schedule(): void {
    const horizon = this.deps.now() + this.lookahead;
    while (this.nextTime < horizon) {
      this.emit('step', { step: this.nextStep, time: this.nextTime, bpm: this.bpm });
      this.nextStep++;
      this.nextTime = this.anchor + this.nextStep * this.stepDur;
    }
  }
}

/** Tap tempo: média dos últimos intervalos; recomeça se passarem mais de 2 s. */
export class TapTempo {
  private taps: number[] = [];

  tap(ms: number): number | null {
    const last = this.taps[this.taps.length - 1];
    if (last !== undefined && ms - last > 2000) this.taps = [];
    this.taps.push(ms);
    if (this.taps.length > 5) this.taps.shift();
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1] - this.taps[0];
    return clampBpm(60000 / (span / (this.taps.length - 1)));
  }

  reset(): void {
    this.taps = [];
  }
}
