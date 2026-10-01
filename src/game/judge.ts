// Modo de jogo: o juiz compara os toques com os tempos das notas (em segundos de áudio).
import { GOOD_S, PERFECT_S } from './config';
import type { Judgement } from './types';

export const NOTE_PENDING = 0;
export const NOTE_PERFECT = 1;
export const NOTE_GOOD = 2;
export const NOTE_MISS = 3;

export interface Hit {
  index: number;
  judgement: Judgement;
  /** Toque − nota (s): positivo = tarde. */
  offset: number;
}

export class Judge {
  /** Estado de cada nota (`NOTE_*`), lido também pelo canvas. */
  readonly state: Uint8Array;
  private byLane: number[][];
  private laneFrom: number[];
  private sweepFrom = 0;
  private left: number;

  /** `times` ordenados; `lanes[k]` é a faixa da nota `k`. */
  constructor(
    private readonly times: readonly number[],
    lanes: readonly number[],
    laneCount: number,
  ) {
    this.state = new Uint8Array(times.length);
    this.left = times.length;
    this.byLane = Array.from({ length: laneCount }, () => []);
    lanes.forEach((l, k) => this.byLane[l]?.push(k));
    this.laneFrom = new Array<number>(laneCount).fill(0);
  }

  get done(): boolean {
    return this.left === 0;
  }

  /**
   * Toque numa faixa no instante `t`: julga a nota mais antiga por julgar dessa faixa que esteja
   * dentro da janela do Bom. Fora dela (toque solto) devolve null e não mexe em nada.
   */
  press(lane: number, t: number): Hit | null {
    const list = this.byLane[lane];
    if (!list) return null;
    while (this.laneFrom[lane] < list.length && this.state[list[this.laneFrom[lane]]] !== NOTE_PENDING)
      this.laneFrom[lane]++;
    for (let j = this.laneFrom[lane]; j < list.length; j++) {
      const k = list[j];
      if (this.state[k] !== NOTE_PENDING) continue;
      const offset = t - this.times[k];
      if (offset > GOOD_S) continue;
      if (offset < -GOOD_S) return null;
      const judgement: Judgement = Math.abs(offset) <= PERFECT_S ? 'perfect' : 'good';
      this.state[k] = judgement === 'perfect' ? NOTE_PERFECT : NOTE_GOOD;
      this.left--;
      return { index: k, judgement, offset };
    }
    return null;
  }

  /** Marca como falhadas as notas que passaram a janela do Bom até `t`; devolve os índices. */
  sweep(t: number): number[] {
    const out: number[] = [];
    while (this.sweepFrom < this.times.length && t - this.times[this.sweepFrom] > GOOD_S) {
      const k = this.sweepFrom++;
      if (this.state[k] !== NOTE_PENDING) continue;
      this.state[k] = NOTE_MISS;
      this.left--;
      out.push(k);
    }
    return out;
  }
}
