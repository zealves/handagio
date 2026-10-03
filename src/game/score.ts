// Modo de jogo: pontos, combo, multiplicador e resultado da ronda.
import { COMBO_STEP, MAX_MULTIPLIER, POINTS, WRONG_TAP_WEIGHT } from './config';
import type { GameResult, Judgement } from './types';

export class Score {
  points = 0;
  combo = 0;
  maxCombo = 0;
  perfect = 0;
  good = 0;
  miss = 0;
  lateTaps = 0;
  wrongTaps = 0;
  private offsetSum = 0;

  /** ×1, ×2 a partir de 10 seguidos, ×3 a partir de 20, ×4 a partir de 30. */
  get multiplier(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this.combo / COMBO_STEP));
  }

  /**
   * Um acerto; devolve os pontos ganhos (com o multiplicador de antes deste acerto). `mult`
   * é o fator da energia ativa (`POWER_MULTIPLIER` quando está, 1 fora dela).
   */
  hit(j: Judgement, offset: number, mult = 1): number {
    const pts = POINTS[j] * this.multiplier * mult;
    this.points += pts;
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (j === 'perfect') this.perfect++;
    else this.good++;
    this.offsetSum += offset;
    return pts;
  }

  missed(): void {
    this.miss++;
    this.combo = 0;
  }

  /** Um "Tarde!" da câmara (dobra vista depois da janela). */
  lateTap(): void {
    this.lateTaps++;
  }

  /**
   * Um toque errado: fora de qualquer nota por julgar, sem a tolerância do vizinho. `GameRun.
   * flushStrays` chama com `breakCombo` falso: o toque solto partiu o combo no seu próprio
   * instante (lá fora, em ordem de tempo), não agora, por isso é o próprio `GameRun` que ajusta
   * `combo` a seguir, em vez de o deixar ir simplesmente a 0.
   */
  wrongTap(breakCombo = true): void {
    this.wrongTaps++;
    if (breakCombo) this.combo = 0;
  }

  /** Um "Cedo!"/"Tarde!": não conta como errado, mas parte o combo. */
  nearTap(): void {
    this.combo = 0;
  }

  result(
    total: number,
  ): Omit<
    GameResult,
    | 'best'
    | 'lagMs'
    | 'startLagMs'
    | 'stars'
    | 'unlocked'
    | 'levelId'
    | 'powerUses'
    | 'failed'
    | 'reached'
  > {
    const hits = this.perfect + this.good;
    const base = total + WRONG_TAP_WEIGHT * this.wrongTaps;
    return {
      points: this.points,
      accuracy: base > 0 ? Math.min(1, (this.perfect + 0.5 * this.good) / base) : 0,
      maxCombo: this.maxCombo,
      perfect: this.perfect,
      good: this.good,
      miss: this.miss,
      total,
      meanOffsetMs: hits ? Math.round((this.offsetSum / hits) * 1000) : null,
      lateTaps: this.lateTaps,
      wrongTaps: this.wrongTaps,
    };
  }
}
