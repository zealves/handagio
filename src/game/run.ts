// Modo de jogo: uma ronda. Liga a partitura ao relógio (tempo de áudio), ao juiz e à pontuação,
// aprende o atraso da câmara e sabe pausar. Sem áudio nem React: a sessão injeta `playBacking`.
// A pausa não suspende o áudio (o desbloqueio do engine retoma-o a cada clique): ao continuar,
// a ronda desloca-se por um número inteiro de passos para o próximo compasso livre do relógio.
import {
  COUNT_IN_STEPS,
  END_TAIL_S,
  LAG_LEARN,
  LAG_MAX_MS,
  LAG_MIN_MS,
  LAG_SAVE_MIN_HITS,
  roundLagMs,
  START_MARGIN_S,
} from './config';
import { DRUM_SLOT } from './generator';
import { Judge, type Hit, type Near } from './judge';
import { Score } from './score';
import type { BackingEvent, Chart, ChartNote, GameResult, Judgement } from './types';

export interface RunTiming {
  /** Passo do relógio onde começa o compasso de entrada. */
  startStep: number;
  /** Tempo de áudio desse passo. */
  t0: number;
  stepDur: number;
  /** Atraso inicial da câmara (s); a ronda vai-o ajustando com os toques. */
  lag: number;
  /** Tempo de chegada (s), para o canvas. */
  lead: number;
}

export type PressResult = (Hit & { lane: number; note: ChartNote }) | (Near & { lane: number });

export interface RunDeps {
  playBacking(ev: BackingEvent, when: number): void;
}

const STEPS_PER_BEAT = 4;
/** Choque da contagem depois de uma pausa (como o da entrada). */
const COUNT_HAT: BackingEvent = { step: 0, kind: 'drum', slot: DRUM_SLOT.hat, vel: 0.6 };

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
  /** Último juízo, para o texto do canvas. */
  last: { kind: Judgement | 'miss' | 'early' | 'late'; at: number } | null = null;
  /** Compasso 1 (fim da entrada) e fim da ronda; mudam com a pausa. */
  start: number;
  end: number;
  /** Quando a música (re)começa: o fim da entrada ou da contagem depois de uma pausa. */
  countTo: number;
  state: 'countdown' | 'playing' | 'paused' | 'over' = 'countdown';
  /** Atraso atual da câmara (s), aprendido com os toques. */
  lag: number;
  /** Toques da câmara julgados (acertos e Cedo/Tarde). */
  cameraHits = 0;
  private startStep: number;
  private bi = 0;
  private pausedAt: number | null = null;
  /** Primeiro passo da partitura ainda por ouvir quando se pausou. */
  private pRel = 0;
  /** Passo do relógio em que a música retoma (a contagem é o compasso antes). */
  private resumeStep: number | null = null;

  constructor(
    readonly chart: Chart,
    private readonly deps: RunDeps,
    readonly timing: RunTiming,
  ) {
    const { t0, stepDur } = timing;
    this.startStep = timing.startStep;
    this.lag = timing.lag;
    this.start = t0 + COUNT_IN_STEPS * stepDur;
    this.countTo = this.start;
    this.times = chart.notes.map((n) => this.start + n.step * stepDur);
    // o atraso aprendido pode subir até `LAG_MAX_MS`: o fim espera por ele
    this.end = this.start + chart.bars * 16 * stepDur + END_TAIL_S + LAG_MAX_MS / 1000;
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
    if (this.state === 'paused' || this.state === 'over') return;
    if (this.resumeStep !== null && absStep < this.resumeStep) {
      const k = absStep - (this.resumeStep - COUNT_IN_STEPS);
      if (k >= 0 && k % STEPS_PER_BEAT === 0) this.deps.playBacking(COUNT_HAT, time);
      return;
    }
    const rel = absStep - this.startStep - COUNT_IN_STEPS;
    const b = this.chart.backing;
    while (this.bi < b.length && b[this.bi].step < rel) this.bi++;
    while (this.bi < b.length && b[this.bi].step === rel) this.deps.playBacking(b[this.bi++], time);
  }

  /**
   * Toque numa faixa agora (`now` em tempo de áudio). Os da câmara descontam o atraso e
   * ensinam-no (`LAG_LEARN` do desvio); os do teclado não. Em pausa ou no fim, null.
   */
  press(lane: number, now: number, fromCamera = true): PressResult | null {
    if (this.state === 'paused' || this.state === 'over') return null;
    const out = this.judge.press(lane, now - (fromCamera ? this.lag : 0));
    if (!out) return null;
    if (fromCamera) {
      this.lag = Math.min(
        LAG_MAX_MS / 1000,
        Math.max(LAG_MIN_MS / 1000, this.lag + LAG_LEARN * out.offset),
      );
      this.cameraHits++;
    }
    this.last = { kind: out.kind, at: now };
    // `index` só existe num acerto (Hit); o TS não estreita a união só com `out.kind`
    if (!('index' in out)) return { ...out, lane };
    this.score.hit(out.kind, out.offset);
    this.judgedAt[out.index] = now;
    this.hitAt[lane] = now;
    return { ...out, lane, note: this.chart.notes[out.index] };
  }

  /** A cada fotograma: falhados, fase e fim. Devolve true na chamada em que a ronda acaba. */
  update(now: number): boolean {
    if (this.state === 'over' || this.state === 'paused') return false;
    for (const k of this.judge.sweep(now - this.lag)) {
      this.score.missed();
      this.judgedAt[k] = now;
      this.last = { kind: 'miss', at: now };
    }
    this.state = now < this.countTo ? 'countdown' : 'playing';
    if (now >= this.end && this.judge.done) {
      this.state = 'over';
      return true;
    }
    return false;
  }

  /** Pausa: congela a vista e a ronda; guarda o primeiro passo ainda por ouvir. */
  pause(now: number): void {
    if (this.state === 'paused' || this.state === 'over') return;
    this.pausedAt = now;
    this.pRel = Math.max(0, Math.ceil((now - this.start) / this.timing.stepDur - 1e-9));
    this.state = 'paused';
  }

  /**
   * Continua: a contagem é o compasso que começa em `barStep` (`barTime`) e o passo `pRel` da
   * partitura cai logo a seguir. Tudo o que tem tempo desloca-se pela mesma diferença.
   */
  resume(barStep: number, barTime: number): void {
    if (this.state !== 'paused') return;
    const { stepDur } = this.timing;
    const newStart = barTime + (COUNT_IN_STEPS - this.pRel) * stepDur;
    const dt = newStart - this.start;
    for (let k = 0; k < this.times.length; k++) {
      this.times[k] += dt;
      this.judgedAt[k] += dt;
    }
    for (let l = 0; l < this.hitAt.length; l++) this.hitAt[l] += dt;
    if (this.last) this.last = { ...this.last, at: this.last.at + dt };
    this.start = newStart;
    this.end += dt;
    this.startStep = barStep - this.pRel;
    this.resumeStep = barStep + COUNT_IN_STEPS;
    this.countTo = barTime + COUNT_IN_STEPS * stepDur;
    const b = this.chart.backing;
    this.bi = b.findIndex((e) => e.step >= this.pRel);
    if (this.bi < 0) this.bi = b.length;
    this.pausedAt = null;
    this.state = 'countdown';
  }

  /** O instante que o canvas desenha: parado em pausa. */
  viewNow(now: number): number {
    return this.pausedAt ?? now;
  }

  result(best: boolean): GameResult {
    return {
      ...this.score.result(this.chart.notes.length),
      best,
      lagMs: this.cameraHits >= LAG_SAVE_MIN_HITS ? roundLagMs(this.lag) : null,
    };
  }
}
