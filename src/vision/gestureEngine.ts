// Transforma dobras de dedos em eventos de notas: histerese, velocidade, disparo e libertação.
// Valores e fórmulas copiados de processHands() no protótipo.
import { clamp } from '../audio/theory';
import { Emitter } from '../lib/emitter';
import type { Calibration } from '../state/types';
import { curls } from './fingerCurl';
import { isActive, TIP_IDS } from './fingerMap';
import type { AssignedHands } from './types';

export interface GestureEvents extends Record<string, unknown> {
  /** Dedo dobrou: velocity 0.2..1, shift em graus da escala (altura do pulso). */
  noteOn: { finger: number; velocity: number; shift: number };
  noteOff: { finger: number };
  /** Instrumentos contínuos (theremin): level 0..1, pitch em semitons sobre a nota base. */
  continuous: { finger: number; level: number; pitch: number };
  /** Nota sustentada: deslocamento contínuo em semitons sobre a nota base. */
  glide: { finger: number; pitch: number };
}

export interface GestureOptions {
  sensitivity: number; // 0..1
  /** Sensibilidade só dos polegares (0..1); por defeito 0.5. */
  thumbSensitivity?: number;
  thumbs: boolean;
  heightPitch: boolean;
  glide: boolean;
  continuous: boolean;
  scaleLen: number;
  calibration?: Calibration | null;
}

export interface FingerLive {
  curl: number;
  prevCurl: number;
  vel: number;
  down: boolean;
  /** Polegares: fotogramas seguidos acima do limiar à espera de confirmação (0 = nenhum). */
  dwell: number;
  /** Polegares: velocidade no primeiro fotograma acima do limiar (a do disparo). */
  dwellVel: number;
  /** Ponta do dedo normalizada (0..1), já em espelho. */
  tip: { x: number; y: number } | null;
}

export const VEL_TRIGGER = 0.3;
export const HYSTERESIS = 0.18;

/**
 * Polegares: o polegar mexe-se muito quando se dobram os outros dedos e a sua dobra é mais
 * ruidosa, por isso o limiar de disparo (e o de libertação) sobe esta margem.
 */
export const THUMB_ON_EXTRA = 0.1;
/**
 * Polegares: fotogramas de deteção seguidos acima do limiar antes de disparar (~60 ms a 50 fps,
 * ~100 ms a 30 fps). Um salto de um só fotograma não toca.
 */
export const THUMB_DWELL = 3;
/** Sensibilidade dos polegares neutra (a que não desloca o limiar calibrado). */
export const THUMB_SENS_NEUTRAL = 0.5;
/** Calibrado, o limiar do polegar nunca passa de 85% do caminho entre esticado e dobrado. */
const THUMB_CAL_MAX = 0.85;

/** limiar = 0.75 − sens × 0.45 */
export const onThreshold = (sens: number): number => 0.75 - sens * 0.45;

/** Limiares de um dedo, calibrados ou vindos da sensibilidade. */
export function thresholds(
  i: number,
  sens: number,
  cal?: Calibration | null,
): { on: number; off: number } {
  const base = onThreshold(sens);
  if (cal && cal.closed[i] - cal.open[i] > 0.2) {
    // Calibração: o limiar fica a 60% do caminho entre esticado e dobrado; a sensibilidade
    // continua a deslocá-lo como no modo normal (0.55 é o ponto neutro).
    const span = cal.closed[i] - cal.open[i];
    const on = clamp(cal.open[i] + span * 0.6 - (sens - 0.55) * 0.45, 0.15, 0.95);
    return { on, off: Math.max(cal.open[i] + span * 0.15, on - HYSTERESIS) };
  }
  return { on: base, off: base - HYSTERESIS };
}

/**
 * Limiares de um polegar: os mesmos, com a sensibilidade própria dos polegares, e mais
 * `THUMB_ON_EXTRA`. Com calibração, o limiar vem dos valores do próprio polegar e não passa de
 * `THUMB_CAL_MAX` do caminho, para um polegar dobrado continuar a disparar.
 */
export function thumbThresholds(
  i: number,
  thumbSens: number,
  cal?: Calibration | null,
): { on: number; off: number } {
  if (cal && cal.closed[i] - cal.open[i] > 0.2) {
    const span = cal.closed[i] - cal.open[i];
    // a mesma fórmula da calibração, com o ponto neutro dos polegares (0.5)
    const base = thresholds(i, thumbSens + (0.55 - THUMB_SENS_NEUTRAL), cal);
    const on = clamp(
      Math.min(base.on + THUMB_ON_EXTRA, cal.open[i] + span * THUMB_CAL_MAX),
      0.15,
      0.95,
    );
    return { on, off: Math.max(cal.open[i] + span * 0.15, on - HYSTERESIS) };
  }
  const on = onThreshold(thumbSens) + THUMB_ON_EXTRA;
  return { on, off: on - HYSTERESIS };
}

/** Intensidade da nota a partir da velocidade no disparo. */
export const velocityFrom = (vel: number): number =>
  clamp(0.2 + clamp((vel - VEL_TRIGGER) / 5, 0, 1) * 0.8, 0, 1);

export const newFinger = (): FingerLive => ({
  curl: 0,
  prevCurl: 0,
  vel: 0,
  down: false,
  dwell: 0,
  dwellVel: 0,
  tip: null,
});

export class GestureEngine extends Emitter<GestureEvents> {
  constructor(readonly fingers: FingerLive[] = Array.from({ length: 10 }, newFinger)) {
    super();
  }

  /** dt em segundos, já limitado a [0.008, 0.1] pelo chamador. */
  process(hands: AssignedHands, dt: number, o: GestureOptions): void {
    for (let h = 0; h < 2; h++) {
      const lm = hands[h];
      if (!lm) {
        for (let j = 0; j < 5; j++) {
          const i = h * 5 + j;
          const f = this.fingers[i];
          if (f.down) {
            f.down = false;
            this.emit('noteOff', { finger: i });
          }
          if (o.continuous) this.emit('continuous', { finger: i, level: 0, pitch: 0 });
          f.curl *= 0.8;
          f.dwell = 0;
          f.tip = null;
        }
        continue;
      }
      const cs = curls(lm);
      const heightShift = o.heightPitch ? Math.round((0.55 - lm[0].y) * 8) : 0;
      for (let j = 0; j < 5; j++) {
        const i = h * 5 + j;
        const f = this.fingers[i];
        if (!isActive(i, o.thumbs)) {
          f.curl = 0;
          f.dwell = 0;
          f.tip = null;
          if (f.down) {
            f.down = false;
            this.emit('noteOff', { finger: i });
          }
          continue;
        }
        f.prevCurl = f.curl;
        f.curl = f.curl * 0.35 + cs[j] * 0.65;
        f.vel = f.vel * 0.5 + ((f.curl - f.prevCurl) / dt) * 0.5;
        const tip = lm[TIP_IDS[j]];
        f.tip = { x: tip.x, y: tip.y };
        const { on, off } =
          j === 0
            ? thumbThresholds(i, o.thumbSensitivity ?? THUMB_SENS_NEUTRAL, o.calibration)
            : thresholds(i, o.sensitivity, o.calibration);

        if (o.continuous) {
          const lvl = clamp((f.curl - off * 0.6) / (1 - off * 0.6), 0, 1);
          const pitch = o.heightPitch ? (0.55 - tip.y) * 15 : 0;
          this.emit('continuous', { finger: i, level: lvl, pitch });
        } else if (!f.down && j === 0) {
          // polegar: tem de ficar acima do limiar THUMB_DWELL fotogramas seguidos
          if (f.curl <= on) f.dwell = 0;
          else if (f.dwell > 0) f.dwell++;
          else if (f.vel > VEL_TRIGGER) {
            f.dwell = 1;
            f.dwellVel = f.vel;
          }
          if (f.dwell >= THUMB_DWELL) {
            f.dwell = 0;
            f.down = true;
            this.emit('noteOn', {
              finger: i,
              velocity: velocityFrom(f.dwellVel),
              shift: heightShift,
            });
          }
        } else if (!f.down && f.curl > on && f.vel > VEL_TRIGGER) {
          f.down = true;
          this.emit('noteOn', { finger: i, velocity: velocityFrom(f.vel), shift: heightShift });
        } else if (f.down && f.curl < off) {
          f.down = false;
          this.emit('noteOff', { finger: i });
        } else if (f.down && o.glide) {
          const pitch = o.heightPitch ? (0.55 - lm[0].y) * 8 * (12 / o.scaleLen) : 0;
          this.emit('glide', { finger: i, pitch });
        }
      }
    }
  }

  /** Liberta tudo (mudança de instrumento, polegares, perda da câmara). */
  releaseAll(): void {
    this.fingers.forEach((f, i) => {
      if (f.down) this.emit('noteOff', { finger: i });
      f.down = false;
      f.dwell = 0;
    });
  }

  reset(): void {
    this.releaseAll();
    this.fingers.forEach((f) => Object.assign(f, newFinger()));
  }
}
