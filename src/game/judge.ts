// Modo de jogo: o juiz compara os toques com os tempos das notas (em segundos de áudio).
import { GOOD_S, NEAR_S, PERFECT_S } from './config';
import type { Judgement } from './types';

export const NOTE_PENDING = 0;
export const NOTE_PERFECT = 1;
export const NOTE_GOOD = 2;
export const NOTE_MISS = 3;

export interface Hit {
  kind: Judgement;
  index: number;
  /** Toque − nota (s): positivo = tarde. */
  offset: number;
}
/**
 * Toque perto de uma nota mas fora da janela: não gasta a nota. `index` é essa nota (a ronda
 * usa-o para aprender o atraso uma só vez por nota). Um "Tarde" pode ser de uma nota já falhada.
 */
export interface Near {
  kind: 'early' | 'late';
  index: number;
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
   * Toque numa faixa no instante `t`. Dá um acerto na nota mais antiga por julgar da faixa
   * dentro da janela do Bom (um acerto ganha sempre a um Cedo/Tarde); senão "Cedo"/"Tarde" com
   * a nota mais próxima até `NEAR_S`; senão null (toque solto). Só um acerto muda o estado.
   *
   * O "Tarde" também conta com as notas que o `sweep` já marcou como falhadas (passaram o Bom
   * há menos de `NEAR_S`): o sweep corre a cada fotograma, por isso sem isto um toque tardio
   * só encontraria a sua nota durante ~1 fotograma e seria julgado contra a nota seguinte
   * (como "Cedo"), o que puxaria o atraso aprendido sempre para baixo. A nota continua falhada.
   */
  press(lane: number, t: number): Hit | Near | null {
    const list = this.byLane[lane];
    if (!list) return null;
    while (
      this.laneFrom[lane] < list.length &&
      this.state[list[this.laneFrom[lane]]] !== NOTE_PENDING
    )
      this.laneFrom[lane]++;
    let late: Near | null = null;
    // para trás do ponteiro da faixa: a falhada mais recente que ainda está ao alcance do Tarde
    for (let j = this.laneFrom[lane] - 1; j >= 0; j--) {
      const k = list[j];
      const offset = t - this.times[k];
      if (offset > NEAR_S) break;
      if (this.state[k] === NOTE_MISS && offset > GOOD_S) {
        late = { kind: 'late', index: k, offset };
        break;
      }
    }
    for (let j = this.laneFrom[lane]; j < list.length; j++) {
      const k = list[j];
      const st = this.state[k];
      const offset = t - this.times[k];
      if (st !== NOTE_PENDING) {
        // o sweep pode marcar notas mais à frente fora da ordem da faixa
        if (st === NOTE_MISS && offset > GOOD_S && offset <= NEAR_S)
          late = { kind: 'late', index: k, offset };
        continue;
      }
      if (offset > GOOD_S) {
        if (offset <= NEAR_S) late = { kind: 'late', index: k, offset };
        continue;
      }
      if (offset < -GOOD_S)
        return nearer(offset >= -NEAR_S ? { kind: 'early', index: k, offset } : null, late);
      const kind: Judgement = Math.abs(offset) <= PERFECT_S ? 'perfect' : 'good';
      this.state[k] = kind === 'perfect' ? NOTE_PERFECT : NOTE_GOOD;
      this.left--;
      return { kind, index: k, offset };
    }
    return late;
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

/** O mais próximo entre um "cedo" e um "tarde" (em empate, tarde). */
function nearer(early: Near | null, late: Near | null): Near | null {
  if (early === null) return late;
  if (late === null) return early;
  return -early.offset < late.offset ? early : late;
}
