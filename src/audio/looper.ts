// Looper de 1, 2 ou 4 compassos sincronizado com o relógio. Grava eventos (não áudio), para o
// loop poder acompanhar mudanças de instrumento; com "congelar" toca com o instrumento original.
import { STEPS_PER_BAR, STEPS_PER_BEAT } from './metronome';

export type LoopEvent =
  | {
      kind: 'note';
      pos: number;
      dur: number;
      midi: number;
      vel: number;
      instrument: string;
      pan: number;
    }
  | { kind: 'drum'; pos: number; slot: number; vel: number; instrument: string };

/** Evento ainda sem posição (Omit distributivo sobre a união). */
export type LoopEventInput = LoopEvent extends infer E
  ? E extends LoopEvent
    ? Omit<E, 'pos'>
    : never
  : never;

export type LooperState = 'idle' | 'armed' | 'recording' | 'playing';

/**
 * `pos` e `dur` estão em passos (semicolcheias) desde o início do loop. A gravação e a
 * reprodução decidem-se pela posição (passo absoluto do relógio) e não pelo estado, porque os
 * passos são agendados 100 ms antes de soarem: assim nenhuma nota do fim do compasso se perde.
 */
export class Looper {
  state: LooperState = 'idle';
  bars = 2;
  layers: LoopEvent[][] = [];
  /** Passo absoluto do relógio em que o loop começa. */
  startStep = 0;
  private overdub: LoopEvent[] | null = null;
  private open = new Map<string, LoopEvent & { kind: 'note' }>();

  get lengthSteps(): number {
    return this.bars * STEPS_PER_BAR;
  }

  get overdubbing(): boolean {
    return this.overdub !== null;
  }

  private get endStep(): number {
    return this.startStep + this.lengthSteps;
  }

  /** Arma a gravação da primeira camada; começa em `startStep` (início do próximo compasso). */
  arm(startStep: number, bars: number): void {
    this.bars = bars;
    this.startStep = startStep;
    this.layers = [[]];
    this.overdub = null;
    this.open.clear();
    this.state = 'armed';
  }

  /** Posição dentro do loop (em passos) para um passo absoluto. */
  loopPos(absStep: number): number {
    const L = this.lengthSteps;
    return (((absStep - this.startStep) % L) + L) % L;
  }

  /** Atualiza o estado visível com o passo atual. Devolve true se o estado mudou. */
  advance(absStep: number): boolean {
    const before = this.state;
    if (this.state === 'armed' && absStep >= this.startStep) this.state = 'recording';
    if (this.state === 'recording' && absStep >= this.endStep) {
      for (const [k] of this.open) this.release(this.endStep, k);
      this.state = 'playing';
    }
    return before !== this.state;
  }

  /** Grava um evento no passo absoluto `absStep` (fracionário). */
  record(absStep: number, ev: LoopEventInput & { key?: string }): void {
    const { key, ...rest } = ev as LoopEvent & { key?: string };
    let target: LoopEvent[] | null = null;
    if (
      this.state !== 'idle' &&
      this.layers.length &&
      absStep >= this.startStep &&
      absStep < this.endStep
    )
      target = this.layers[0];
    else if (this.overdub && absStep >= this.endStep) target = this.overdub;
    if (!target) return;
    const e = { ...rest, pos: this.loopPos(absStep) } as LoopEvent;
    target.push(e);
    if (e.kind === 'note' && key) this.open.set(key, e);
  }

  /** Fim de uma nota sustentada gravada. */
  release(absStep: number, key: string): void {
    const e = this.open.get(key);
    if (!e) return;
    this.open.delete(key);
    const L = this.lengthSteps;
    const d = (this.loopPos(absStep) - e.pos + L) % L;
    e.dur = Math.max(0.25, d || L);
  }

  startOverdub(): void {
    if (this.state !== 'playing' || this.overdub) return;
    this.overdub = [];
    this.open.clear();
  }

  stopOverdub(absStep: number): void {
    if (!this.overdub) return;
    for (const [k] of this.open) this.release(absStep, k);
    if (this.overdub.length) this.layers.push(this.overdub);
    this.overdub = null;
  }

  undo(): void {
    if (this.overdub) {
      this.overdub = [];
      this.open.clear();
      return;
    }
    this.layers.pop();
    if (!this.layers.length) this.clear();
  }

  clear(): void {
    this.layers = [];
    this.overdub = null;
    this.open.clear();
    this.state = 'idle';
  }

  /** Eventos que caem no passo absoluto `absStep` (janela de 1 passo), só depois da 1.ª volta. */
  eventsAt(absStep: number): { ev: LoopEvent; offset: number }[] {
    if (this.state === 'idle' || absStep < this.endStep) return [];
    const p = this.loopPos(absStep);
    const out: { ev: LoopEvent; offset: number }[] = [];
    for (const layer of this.layers)
      for (const ev of layer)
        if (ev.pos >= p && ev.pos < p + 1) out.push({ ev, offset: ev.pos - p });
    return out;
  }

  get eventCount(): number {
    return this.layers.reduce((n, l) => n + l.length, 0);
  }

  /** Compasso atual (0..bars-1) para o indicador. */
  barAt(absStep: number): number {
    return Math.floor(this.loopPos(absStep) / STEPS_PER_BAR);
  }
}

export const beatsToSteps = (b: number): number => b * STEPS_PER_BEAT;
