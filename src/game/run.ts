// Modo de jogo: uma ronda. Liga a partitura ao relógio (tempo de áudio), ao juiz e à pontuação.
// Sem áudio nem React: a sessão injeta `playBacking` e lê o resto.
import { COUNT_IN_STEPS, END_TAIL_S, START_MARGIN_S } from './config';
import { Judge, type Hit } from './judge';
import { Score } from './score';
import type { BackingEvent, Chart, ChartNote, GameResult, Judgement } from './types';

export interface RunTiming {
  /** Passo do relógio onde começa o compasso de entrada. */
  startStep: number;
  /** Tempo de áudio desse passo. */
  t0: number;
  stepDur: number;
  /** Atraso da câmara (s), descontado aos toques e ao marcar falhados. */
  lag: number;
  /** Tempo de chegada (s), para o canvas. */
  lead: number;
}

export interface PressResult extends Hit {
  lane: number;
  note: ChartNote;
}

export interface RunDeps {
  playBacking(ev: BackingEvent, when: number): void;
}

/** Compasso de partida: o próximo depois do que o relógio já agendou (lookahead + margem). */
export function gameStartBar(
  clock: { lookahead: number; nextBarTime(t: number): { time: number; step: number } },
  now: number,
): { time: number; step: number } {
  return clock.nextBarTime(now + clock.lookahead + START_MARGIN_S);
}

export class GameRun {
  readonly times: number[];
  readonly judge: Judge;
  readonly score = new Score();
  /** Quando cada nota foi julgada (tempo de áudio), para as animações. */
  readonly judgedAt: Float64Array;
  /** Último acerto de cada faixa (tempo de áudio). */
  readonly hitAt: Float64Array;
  /** Último juízo, para o texto "Perfeito!" do canvas. */
  last: { kind: Judgement | 'miss'; at: number } | null = null;
  /** Início do compasso 1 (fim da entrada) e da ronda terminada. */
  readonly start: number;
  readonly end: number;
  state: 'countdown' | 'playing' | 'over' = 'countdown';
  private bi = 0;

  constructor(
    readonly chart: Chart,
    private readonly deps: RunDeps,
    readonly timing: RunTiming,
  ) {
    const { t0, stepDur, lag } = timing;
    this.start = t0 + COUNT_IN_STEPS * stepDur;
    this.times = chart.notes.map((n) => this.start + n.step * stepDur);
    this.end = this.start + chart.bars * 16 * stepDur + END_TAIL_S + lag;
    this.judge = new Judge(
      this.times,
      chart.notes.map((n) => n.lane),
      chart.lanes,
    );
    this.judgedAt = new Float64Array(chart.notes.length);
    this.hitAt = new Float64Array(chart.lanes).fill(-Infinity);
  }

  /** Passo do relógio (já com o tempo de áudio): agenda o acompanhamento desse passo. */
  onStep(absStep: number, time: number): void {
    const rel = absStep - this.timing.startStep - COUNT_IN_STEPS;
    const b = this.chart.backing;
    while (this.bi < b.length && b[this.bi].step < rel) this.bi++;
    while (this.bi < b.length && b[this.bi].step === rel) this.deps.playBacking(b[this.bi++], time);
  }

  /** Toque numa faixa agora (`now` em tempo de áudio); `lag` 0 para o teclado. */
  press(lane: number, now: number, lag = this.timing.lag): PressResult | null {
    if (this.state === 'over') return null;
    const hit = this.judge.press(lane, now - lag);
    if (!hit) return null;
    this.score.hit(hit.judgement, hit.offset);
    this.judgedAt[hit.index] = now;
    this.hitAt[lane] = now;
    this.last = { kind: hit.judgement, at: now };
    return { ...hit, lane, note: this.chart.notes[hit.index] };
  }

  /** A cada fotograma: falhados, fase e fim. Devolve true na chamada em que a ronda acaba. */
  update(now: number): boolean {
    if (this.state === 'over') return false;
    for (const k of this.judge.sweep(now - this.timing.lag)) {
      this.score.missed();
      this.judgedAt[k] = now;
      this.last = { kind: 'miss', at: now };
    }
    this.state = now < this.start ? 'countdown' : 'playing';
    if (now >= this.end && this.judge.done) {
      this.state = 'over';
      return true;
    }
    return false;
  }

  result(best: boolean): GameResult {
    return { ...this.score.result(this.chart.notes.length), best };
  }
}
