// Transforma dobras de dedos em eventos de notas: histerese, velocidade, disparo e libertação.
// Partiu de processHands() no protótipo; desde a v2.2 a deteção dos dedos (suavização,
// limiares por dedo, disparo antecipado, período refratário e aprendizagem) foi afinada para
// ser mais rápida e mais fácil (docs/DECISIONS.md, 62). Os polegares mantêm as regras antigas.
import { clamp } from '../audio/theory';
import { Emitter } from '../lib/emitter';
import type { Calibration } from '../state/types';
import {
  AdaptiveRanges,
  LEARN_MIN_SCORE,
  LEARN_SKIP_FRAMES,
  usableRange,
  type LearnedRange,
} from './adaptive';
import { curls } from './fingerCurl';
import { isActive, TIP_IDS } from './fingerMap';
import type { AssignedHands } from './types';

export interface GestureEvents extends Record<string, unknown> {
  /** Dedo dobrou: velocity 0.2..1, shift em graus da escala (altura do pulso). */
  noteOn: { finger: number; velocity: number; shift: number };
  noteOff: { finger: number };
  /** Instrumentos contínuos (theremin): level 0..1, pitch em semitons sobre a nota base. */
  continuous: { finger: number; level: number; pitch: number };
  /** Nota sustentada: desvio contínuo em meios-tons em relação à nota que foi tocada. */
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
  calibration?: Calibration | null;
  /** Aprender o intervalo de cada dedo enquanto se toca e usá-lo nos limiares (por defeito não). */
  learn?: boolean;
}

export interface FingerLive {
  /** Dobra suavizada (0..1): é a que passa os limiares e a que os canvas desenham. */
  curl: number;
  prevCurl: number;
  /** Velocidade da dobra (/s), da dobra crua com uma suavização leve (polegares: da suavizada). */
  vel: number;
  /** Última dobra crua (sem suavização). */
  raw: number;
  /** Velocidade crua (/s) entre os dois últimos fotogramas. */
  rawVel: number;
  /** Segundos que ainda faltam do período refratário depois de um noteOff (0 = livre). */
  refr: number;
  down: boolean;
  /** Polegares: fotogramas seguidos acima do limiar à espera de confirmação (0 = nenhum). */
  dwell: number;
  /** Polegares: velocidade no primeiro fotograma acima do limiar (a do disparo). */
  dwellVel: number;
  /** Polegares: segundos acima do limiar (soma dos `dt` depois do primeiro fotograma acima). */
  dwellT: number;
  /** Ponta do dedo normalizada (0..1), já em espelho. */
  tip: { x: number; y: number } | null;
  /** Altura do pulso (`lm[0].y`) no fotograma em que a nota disparou (ponto de partida do arrastar). */
  y0: number;
  /** Desvio do arrastar em meios-tons, já suavizado. */
  bend: number;
}

export const VEL_TRIGGER = 0.3;
export const HYSTERESIS = 0.18;

/**
 * Suavização da dobra: peso do valor anterior na EMA (`curl = prev × k + cru × (1 − k)`).
 * O protótipo usava 0.35; 0.2 responde mais depressa (~1 fotograma a menos de atraso).
 */
export const CURL_SMOOTH_PREV = 0.2;
/** Velocidade: peso do valor anterior na EMA da derivada da dobra crua. */
export const VEL_SMOOTH_PREV = 0.3;
/**
 * Suavização da v2.1 (a do protótipo): os polegares usam-na (dobra mais ruidosa; regras
 * próprias, ver THUMB_DWELL) e, nos outros dedos, é a dobra (`slowCurl`) e a velocidade que
 * passam o `on` sem desconto, exatamente como na v2.1. A dobra leve (`CURL_SMOOTH_PREV`) fica
 * para o disparo antecipado, o disparo pelo desconto e a libertação: com ela no disparo normal, o
 * tremor lento de um dedo parado chegava ao `on` mais vezes do que na v2.1.
 */
export const THUMB_CURL_SMOOTH_PREV = 0.35;
export const THUMB_VEL_SMOOTH_PREV = 0.5;

/**
 * Desconto no limiar de disparo por dedo (índice j: 0 polegar, 1 indicador, 2 médio, 3 anelar,
 * 4 mindinho). O anelar e o mindinho dobram menos (movimento acoplado aos vizinhos), por isso o
 * `on` baixa este valor. O `off` NÃO baixa (fica o da v2.1, `on` sem desconto − `HYSTERESIS`):
 * um mindinho relaxado costuma ficar mais dobrado, e um `off` mais baixo prendia a nota. Para
 * disparar só pelo desconto (entre o `on` e o `on` sem desconto) o dedo tem de subir de verdade
 * (ver `BASELINE_S`, `DISCOUNT_MIN_SLOPE`). Nos limiares aprendidos o desconto é uma fração do
 * intervalo aprendido.
 */
export const FINGER_ON_DISCOUNT = [0, 0, 0, 0.06, 0.12] as const;
/** Limiar de disparo mínimo sem calibração (sensibilidade no máximo com o desconto do mindinho). */
export const ON_MIN = 0.2;

/**
 * Disparo antecipado: com o dedo a dobrar depressa, a nota sai antes de a dobra chegar ao `on`.
 * Condições (todas):
 * - velocidade (declive da dobra crua nos 2 últimos fotogramas) acima de `EARLY_VEL` (/s), com a
 *   dobra crua a subir nos dois (um salto isolado da deteção não chega);
 * - dobra crua já a `EARLY_FRACTION` do caminho entre o repouso (0, ou o esticado
 *   calibrado/aprendido) e o `on` SEM o desconto do dedo: o desconto do anelar e do mindinho não se
 *   soma ao antecipado, para o ruído de um dedo parado continuar abaixo deste nível;
 * - e a mesma distância percorrida a partir da linha de base (o mínimo da dobra crua nos últimos
 *   `BASELINE_S`): um dedo que repousa já meio dobrado tem de subir tanto como um esticado;
 * - este dedo a mexer-se pelo menos `EARLY_DOMINANCE` × o dedo mais rápido da mesma mão (quando
 *   se dobra o anelar, o mindinho e o médio vão atrás mais devagar e não disparam antecipados).
 * Só dedos, nunca polegares.
 */
export const EARLY_VEL = 3;
export const EARLY_FRACTION = 0.7;
export const EARLY_DOMINANCE = 0.6;
/**
 * Movimento acoplado: um anelar ou mindinho que só passa o `on` graças ao desconto (entre o `on`
 * e o `on` sem desconto) só dispara se estiver a mexer-se pelo menos `COUPLED_DOMINANCE` × o dedo
 * mais rápido da mesma mão, e ainda a subir. Dobrar o anelar arrasta o mindinho (e vice-versa)
 * mais devagar: esse arrasto não toca; o mindinho dobrado de propósito (é o mais rápido) toca.
 */
export const COUPLED_DOMINANCE = 0.6;
/**
 * Linha de base de cada dedo: o mínimo da dobra crua nos últimos `BASELINE_S` segundos (sem o
 * fotograma atual), ou, se for mais alto, o valor onde começou a subida atual (fotogramas
 * seguidos a subir). O disparo antecipado e o disparo só pelo desconto medem a subida a partir
 * daqui, e não de 0: o dedo tem de subir de verdade, de seguida e depressa. O tremor lento
 * (correlacionado) de um dedo parado sobe e desce e não chega; uma dobra sobe sem parar.
 */
export const BASELINE_S = 0.3;
/**
 * Disparo só pelo desconto: a dobra crua tem de ter subido nos dois últimos fotogramas, com um
 * declive médio acima disto (/s).
 */
export const DISCOUNT_MIN_SLOPE = 1.5;
/**
 * Disparo só pelo desconto: fotogramas seguidos com a dobra crua a subir. Uma dobra de verdade
 * sobe sem parar; o tremor lento sobe e desce.
 */
export const DISCOUNT_MIN_RISES = 3;
/**
 * Tremor de cada dedo: desvio-padrão da dobra crua à volta de uma média lenta (constante de tempo
 * `JITTER_TAU_S`), medido com o dedo solto, sem estar a subir e só `JITTER_HOLD_S` depois de
 * soltar a nota (o dedo a esticar depois de tocar não é tremor). O disparo antecipado e o disparo
 * só pelo desconto exigem uma subida de pelo menos `JITTER_K` × esse tremor: com uma deteção
 * muito tremida, só fica o disparo da v2.1. Começa em `JITTER_START`.
 */
export const JITTER_TAU_S = 1;
export const JITTER_K = 8;
export const JITTER_START = 0.03;
export const JITTER_HOLD_S = 0.4;
/** Fotogramas de uma mão ignorados pela aprendizagem depois de trocar de lado. */
export const LEARN_SKIP_AFTER_SWAP = 10;
/** Período refratário (s) depois de um noteOff: o tremor ao esticar não volta a disparar. */
export const REFRACTORY_S = 0.06;

/**
 * Limiares aprendidos: o `on` fica a `LEARN_ON_FRAC` do caminho entre `lo` e `hi` (menos o
 * desconto do dedo, como fração do caminho) e a sensibilidade desloca-o como na calibração; o
 * `off` fica a `LEARN_OFF_FRAC` do caminho, e sempre pelo menos `LEARN_MIN_HYST` abaixo do `on`.
 * O `on` fica em [`LEARN_ON_MIN`, `LEARN_ON_MAX`] e nunca mais de `LEARN_MAX_DROP` abaixo do `on`
 * sem aprendizagem: a aprendizagem pode facilitar, mas pouco de cada vez.
 */
export const LEARN_ON_FRAC = 0.55;
export const LEARN_OFF_FRAC = 0.25;
export const LEARN_MIN_HYST = 0.08;
export const LEARN_ON_MIN = 0.2;
export const LEARN_ON_MAX = 0.9;
export const LEARN_MAX_DROP = 0.1;

/**
 * Altura da mão escolhe a nota: graus da escala por unidade de altura do pulso (0..1), à volta
 * do centro `HEIGHT_CENTER`. 10 dá ~1 grau por cada 10% do ecrã.
 */
export const HEIGHT_DEGREES = 10;
export const HEIGHT_CENTER = 0.55;
/** Arrastar depois de tocar: meios-tons por unidade de altura (~2 por cada 10% do ecrã). */
export const DRAG_SEMITONES = 20;
/** Arrastar: desvio de altura ignorado (tremor da deteção); o tom só muda depois dele, sem salto. */
export const DRAG_DEADZONE = 0.02;
/** Arrastar: peso do valor novo na suavização (EMA). */
export const DRAG_SMOOTH = 0.5;
/** Arrastar: limite do desvio, em meios-tons, para cada lado. */
export const DRAG_MAX = 12;

/** Graus da escala escolhidos pela altura do pulso. */
export const heightShiftOf = (y: number): number =>
  Math.round((HEIGHT_CENTER - y) * HEIGHT_DEGREES);

/** Desvio do arrastar (meios-tons, sem suavização) de `y0` até `y`; positivo quando a mão sobe. */
export function dragSemitones(y0: number, y: number): number {
  const d = y0 - y;
  const past = Math.max(0, Math.abs(d) - DRAG_DEADZONE);
  return clamp(Math.sign(d) * past * DRAG_SEMITONES, -DRAG_MAX, DRAG_MAX);
}

/**
 * Polegares: o polegar mexe-se muito quando se dobram os outros dedos e a sua dobra é mais
 * ruidosa, por isso o limiar de disparo (e o de libertação) sobe esta margem.
 */
export const THUMB_ON_EXTRA = 0.1;
/**
 * Polegares: confirmação do disparo. O polegar tem de ficar acima do limiar em fotogramas de
 * deteção seguidos: dispara ao `THUMB_DWELL_MIN`.º fotograma se já esteve acima pelo menos
 * `THUMB_DWELL_S` segundos (contados a partir do primeiro fotograma acima), ou ao `THUMB_DWELL`.º
 * em qualquer caso. Um salto de um só fotograma nunca toca, e a espera depois do primeiro
 * fotograma acima fica em 1 ou 2 fotogramas: ~33 ms a 60 fps, ~67 ms a 30 fps e a 15 fps (só
 * com a contagem de fotogramas seriam 133 ms a 15 fps).
 */
export const THUMB_DWELL = 3;
export const THUMB_DWELL_MIN = 2;
export const THUMB_DWELL_S = 0.05;
/** Sensibilidade dos polegares neutra (a que não desloca o limiar calibrado). */
export const THUMB_SENS_NEUTRAL = 0.5;
/** Calibrado, o limiar do polegar nunca passa de 85% do caminho entre esticado e dobrado. */
const THUMB_CAL_MAX = 0.85;

/** limiar = 0.75 − sens × 0.45 */
export const onThreshold = (sens: number): number => 0.75 - sens * 0.45;

/** Limiares de um dedo. */
export interface Thresholds {
  /** Disparo. */
  on: number;
  /** Libertação. */
  off: number;
  /** O `on` sem o desconto do dedo (igual ao `on` no indicador, no médio e com calibração). */
  full: number;
  /** Nível do disparo antecipado (ver `EARLY_FRACTION`). */
  early: number;
  /** Dobra de repouso de referência (0, ou o esticado calibrado/aprendido). */
  rest: number;
}

/** Nível do disparo antecipado: `EARLY_FRACTION` do caminho entre o repouso e o `on` sem desconto. */
const earlyLevel = (rest: number, full: number): number => rest + (full - rest) * EARLY_FRACTION;

const calibrated = (i: number, cal?: Calibration | null): cal is Calibration =>
  !!cal && cal.closed[i] - cal.open[i] > 0.2;

/** Limiares sem calibração nem aprendizagem: a sensibilidade menos o desconto do dedo. */
export function defaultThresholds(i: number, sens: number): Thresholds {
  const d = FINGER_ON_DISCOUNT[i % 5];
  const base = onThreshold(sens);
  const on = Math.max(ON_MIN, base - d);
  const full = Math.max(on, base);
  // o `off` fica o da v2.1 (sem desconto): nunca mais baixo, para a nota não ficar presa
  return { on, off: base - HYSTERESIS, full, early: earlyLevel(0, full), rest: 0 };
}

/** Limiares a partir do intervalo aprendido de um dedo (ver `LEARN_ON_FRAC`). */
export function learnedThresholds(i: number, sens: number, r: LearnedRange): Thresholds {
  const span = r.hi - r.lo;
  const d = FINGER_ON_DISCOUNT[i % 5];
  const shift = (sens - 0.55) * 0.45;
  const floor = defaultThresholds(i, sens).on - LEARN_MAX_DROP;
  const on = clamp(
    Math.max(floor, r.lo + span * (LEARN_ON_FRAC - d) - shift),
    LEARN_ON_MIN,
    LEARN_ON_MAX,
  );
  const full = Math.max(on, clamp(r.lo + span * LEARN_ON_FRAC - shift, LEARN_ON_MIN, LEARN_ON_MAX));
  return {
    on,
    off: Math.min(r.lo + span * LEARN_OFF_FRAC, on - LEARN_MIN_HYST),
    full,
    early: earlyLevel(r.lo, full),
    rest: r.lo,
  };
}

/**
 * Limiares de um dedo. Prioridade: calibração manual válida para o dedo > intervalo aprendido
 * utilizável > sensibilidade com o desconto do dedo.
 */
export function thresholds(
  i: number,
  sens: number,
  cal?: Calibration | null,
  learned?: LearnedRange | null,
): Thresholds {
  if (calibrated(i, cal)) {
    // Calibração: o limiar fica a 60% do caminho entre esticado e dobrado; a sensibilidade
    // continua a deslocá-lo como no modo normal (0.55 é o ponto neutro).
    const span = cal.closed[i] - cal.open[i];
    const on = clamp(cal.open[i] + span * 0.6 - (sens - 0.55) * 0.45, 0.15, 0.95);
    const off = Math.max(cal.open[i] + span * 0.15, on - HYSTERESIS);
    return { on, off, full: on, early: earlyLevel(cal.open[i], on), rest: cal.open[i] };
  }
  if (usableRange(learned)) return learnedThresholds(i, sens, learned);
  return defaultThresholds(i, sens);
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
): Thresholds {
  if (calibrated(i, cal)) {
    const span = cal.closed[i] - cal.open[i];
    // a mesma fórmula da calibração, com o ponto neutro dos polegares (0.5)
    const base = thresholds(i, thumbSens + (0.55 - THUMB_SENS_NEUTRAL), cal);
    const on = clamp(
      Math.min(base.on + THUMB_ON_EXTRA, cal.open[i] + span * THUMB_CAL_MAX),
      0.15,
      0.95,
    );
    return {
      on,
      off: Math.max(cal.open[i] + span * 0.15, on - HYSTERESIS),
      full: on,
      early: on,
      rest: cal.open[i],
    };
  }
  const on = onThreshold(thumbSens) + THUMB_ON_EXTRA;
  return { on, off: on - HYSTERESIS, full: on, early: on, rest: 0 };
}

/** Intensidade da nota a partir da velocidade no disparo. */
export const velocityFrom = (vel: number): number =>
  clamp(0.2 + clamp((vel - VEL_TRIGGER) / 5, 0, 1) * 0.8, 0, 1);

export const newFinger = (): FingerLive => ({
  curl: 0,
  prevCurl: 0,
  vel: 0,
  raw: 0,
  rawVel: 0,
  refr: 0,
  down: false,
  dwell: 0,
  dwellVel: 0,
  dwellT: 0,
  tip: null,
  y0: 0,
  bend: 0,
});

/** Regra que disparou uma nota: `on` sem desconto (a da v2.1), só pelo desconto, ou antecipada. */
export type Trigger = 'full' | 'discount' | 'early';

export class GestureEngine extends Emitter<GestureEvents> {
  /** Intervalos aprendidos de cada dedo (usados com `learn`). */
  readonly adaptive = new AdaptiveRanges();
  /** Fotogramas seguidos com cada mão visível (0 = acabou de aparecer ou não está). */
  private handFrames = [0, 0];
  /** Velocidade crua do fotograma anterior e o seu `dt` (declive em 2 fotogramas). */
  private prevRawVel = new Array<number>(10).fill(0);
  private prevDt = [0, 0];
  /**
   * Portão de cada dedo: depois de a mão aparecer ou trocar de lado, o dedo só pode disparar
   * depois de ter sido visto esticado (abaixo do `off` e do nível antecipado). Uma mão que entra,
   * ou que passa para o outro lado, com um dedo dobrado não toca.
   */
  private armed = new Array<boolean>(10).fill(false);
  /** Dobras cruas dos fotogramas anteriores e a sua idade (s), para a linha de base. */
  private histV: number[][] = Array.from({ length: 10 }, () => []);
  private histAge: number[][] = Array.from({ length: 10 }, () => []);
  /** Diagnóstico e testes: a regra do último disparo de cada dedo. */
  readonly lastTrigger: (Trigger | null)[] = new Array(10).fill(null);
  /** Fotogramas seguidos com a dobra crua a subir, e a dobra crua antes de começar a subir. */
  private rises = new Array<number>(10).fill(0);
  private runStart = new Array<number>(10).fill(0);
  /** Tremor de cada dedo (ver `JITTER_TAU_S`): média lenta e variância da dobra crua. */
  private jMean = new Array<number>(10).fill(0);
  private jVar = new Array<number>(10).fill(JITTER_START ** 2);
  /** Segundos desde a última nota solta de cada dedo. */
  private sinceOff = new Array<number>(10).fill(Infinity);
  /** Dobra e velocidade com a suavização da v2.1 (ver `THUMB_CURL_SMOOTH_PREV`). */
  private slowCurl = new Array<number>(10).fill(0);
  private slowVel = new Array<number>(10).fill(0);
  /** Linha de base de cada dedo (ver `BASELINE_S`). */
  private base = new Array<number>(10).fill(0);
  /** Fotogramas que a aprendizagem ainda ignora em cada mão. */
  private learnSkip = [0, 0];

  constructor(readonly fingers: FingerLive[] = Array.from({ length: 10 }, newFinger)) {
    super();
  }

  private release(i: number): void {
    const f = this.fingers[i];
    if (!f.down) return;
    f.down = false;
    f.refr = REFRACTORY_S;
    this.emit('noteOff', { finger: i });
  }

  /**
   * dt em segundos, já limitado a [0.008, 0.1] pelo chamador. `scores`: confiança da
   * lateralidade de cada mão (null/ausente = desconhecida); abaixo de `LEARN_MIN_SCORE` a mão
   * não ensina nada. `swapped`: lados cuja mão mudou neste fotograma (ver `assignHands`); contam
   * como uma mão que acabou de aparecer.
   */
  process(
    hands: AssignedHands,
    dt: number,
    o: GestureOptions,
    scores: readonly (number | null | undefined)[] = [],
    swapped: readonly boolean[] = [],
  ): void {
    for (let h = 0; h < 2; h++) {
      const lm = hands[h];
      if (!lm) {
        this.handFrames[h] = 0;
        for (let j = 0; j < 5; j++) {
          const i = h * 5 + j;
          const f = this.fingers[i];
          this.release(i);
          if (o.continuous) this.emit('continuous', { finger: i, level: 0, pitch: 0 });
          f.curl *= 0.8;
          f.dwell = 0;
          f.dwellT = 0;
          f.tip = null;
          f.refr = Math.max(0, f.refr - dt);
        }
        continue;
      }
      const cs = curls(lm);
      const wristY = lm[0].y;
      const heightShift = o.heightPitch ? heightShiftOf(wristY) : 0;
      // mão acabou de aparecer (ou trocou de lado): a dobra parte do valor atual, sem velocidade,
      // e cada dedo só volta a poder disparar depois de visto esticado (ver `armed`)
      const swap = !!swapped[h] && this.handFrames[h] > 0;
      const appeared = this.handFrames[h] === 0 || swap;
      if (appeared) {
        this.learnSkip[h] = swap ? LEARN_SKIP_AFTER_SWAP : LEARN_SKIP_FRAMES;
        this.handFrames[h] = 0;
        // as notas deste lado eram da outra mão
        if (swap) for (let j = 0; j < 5; j++) this.release(h * 5 + j);
      }
      this.handFrames[h]++;
      const score = scores[h];
      const skipping = this.learnSkip[h] > 0;
      if (skipping) this.learnSkip[h]--;
      const learnHere =
        !!o.learn &&
        !o.continuous &&
        !skipping &&
        (score === null || score === undefined || score >= LEARN_MIN_SCORE);
      const prevDt = this.prevDt[h];
      this.prevDt[h] = dt;

      // 1.º passo: dobra crua, velocidades e suavização de todos os dedos da mão
      let maxRawVel = 0;
      for (let j = 0; j < 5; j++) {
        const i = h * 5 + j;
        const f = this.fingers[i];
        f.refr = Math.max(0, f.refr - dt);
        if (!isActive(i, o.thumbs)) continue;
        const raw = cs[j];
        f.prevCurl = f.curl;
        this.prevRawVel[i] = f.rawVel;
        const hv = this.histV[i];
        const ha = this.histAge[i];
        if (appeared) {
          this.armed[i] = false;
          hv.length = 0;
          ha.length = 0;
          this.base[i] = raw;
          this.prevRawVel[i] = 0;
          f.raw = raw;
          f.rawVel = 0;
          f.vel = 0;
          f.curl = raw;
          f.prevCurl = raw;
          this.slowCurl[i] = raw;
          this.slowVel[i] = 0;
          this.rises[i] = 0;
          this.jMean[i] = raw;
          this.jVar[i] = JITTER_START ** 2;
          continue;
        }
        if (j === 0) {
          // polegares: suavização e velocidade do protótipo
          f.curl = f.curl * THUMB_CURL_SMOOTH_PREV + raw * (1 - THUMB_CURL_SMOOTH_PREV);
          f.vel =
            f.vel * THUMB_VEL_SMOOTH_PREV +
            ((f.curl - f.prevCurl) / dt) * (1 - THUMB_VEL_SMOOTH_PREV);
          f.rawVel = (raw - f.raw) / dt;
        } else {
          f.rawVel = (raw - f.raw) / dt;
          f.vel = f.vel * VEL_SMOOTH_PREV + f.rawVel * (1 - VEL_SMOOTH_PREV);
          f.curl = f.curl * CURL_SMOOTH_PREV + raw * (1 - CURL_SMOOTH_PREV);
          const sc = this.slowCurl[i];
          this.slowCurl[i] = sc * THUMB_CURL_SMOOTH_PREV + raw * (1 - THUMB_CURL_SMOOTH_PREV);
          this.slowVel[i] =
            this.slowVel[i] * THUMB_VEL_SMOOTH_PREV +
            ((this.slowCurl[i] - sc) / dt) * (1 - THUMB_VEL_SMOOTH_PREV);
          maxRawVel = Math.max(maxRawVel, f.rawVel);
          // início da subida atual: a dobra crua antes do primeiro fotograma a subir
          if (f.rawVel <= 0) this.rises[i] = 0;
          else if (this.rises[i]++ === 0) this.runStart[i] = f.raw;
        }
        // linha de base: mínimo das dobras cruas dos últimos BASELINE_S (sem a deste fotograma)
        hv.push(f.raw);
        ha.push(0);
        for (let k = 0; k < ha.length; k++) ha[k] += dt;
        while (ha.length > 1 && ha[0] > BASELINE_S + 1e-9) {
          ha.shift();
          hv.shift();
        }
        // a subida conta desde o mais alto de: o mínimo da janela e o início da subida atual
        // tremor: só com o dedo solto e sem estar a subir (uma dobra não conta como tremor)
        this.sinceOff[i] = f.down ? 0 : this.sinceOff[i] + dt;
        if (j > 0 && !f.down && f.rawVel <= 0 && this.sinceOff[i] >= JITTER_HOLD_S) {
          const a = 1 - Math.exp(-dt / JITTER_TAU_S);
          this.jMean[i] += (raw - this.jMean[i]) * a;
          this.jVar[i] += ((raw - this.jMean[i]) ** 2 - this.jVar[i]) * a;
        }
        this.base[i] = Math.max(Math.min(...hv), j > 0 && this.rises[i] > 0 ? this.runStart[i] : 0);
        f.raw = raw;
      }

      // 2.º passo: limiares e eventos
      for (let j = 0; j < 5; j++) {
        const i = h * 5 + j;
        const f = this.fingers[i];
        if (!isActive(i, o.thumbs)) {
          f.curl = 0;
          f.dwell = 0;
          f.dwellT = 0;
          f.tip = null;
          this.release(i);
          continue;
        }
        const tip = lm[TIP_IDS[j]];
        f.tip = { x: tip.x, y: tip.y };
        if (learnHere && j > 0) this.adaptive.observe(i, f.raw, dt);
        const { on, off, full, early, rest } =
          j === 0
            ? thumbThresholds(i, o.thumbSensitivity ?? THUMB_SENS_NEUTRAL, o.calibration)
            : thresholds(i, o.sensitivity, o.calibration, o.learn ? this.adaptive.ranges[i] : null);

        if (!this.armed[i] && (j === 0 ? f.curl < off : f.raw < Math.max(off, early)))
          this.armed[i] = true;

        if (o.continuous) {
          const lvl = clamp((f.curl - off * 0.6) / (1 - off * 0.6), 0, 1);
          const pitch = o.heightPitch ? (0.55 - tip.y) * 15 : 0;
          this.emit('continuous', { finger: i, level: lvl, pitch });
        } else if (!f.down && j === 0) {
          // polegar: tem de ficar acima do limiar alguns fotogramas seguidos (ver THUMB_DWELL)
          if (f.curl <= on) {
            f.dwell = 0;
            f.dwellT = 0;
          } else if (f.dwell > 0) {
            f.dwell++;
            f.dwellT += dt;
          } else if (f.vel > VEL_TRIGGER && f.refr <= 0 && this.armed[i]) {
            f.dwell = 1;
            f.dwellT = 0;
            f.dwellVel = f.vel;
          }
          if (f.dwell >= THUMB_DWELL || (f.dwell >= THUMB_DWELL_MIN && f.dwellT >= THUMB_DWELL_S)) {
            f.dwell = 0;
            f.dwellT = 0;
            f.down = true;
            f.y0 = wristY;
            f.bend = 0;
            this.emit('noteOn', {
              finger: i,
              velocity: velocityFrom(f.dwellVel),
              shift: heightShift,
            });
          }
        } else if (
          !f.down &&
          f.refr <= 0 &&
          this.armed[i] &&
          (this.lastTrigger[i] = this.trigger(i, on, full, early, rest, dt, prevDt, maxRawVel))
        ) {
          f.down = true;
          f.y0 = wristY;
          f.bend = 0;
          this.emit('noteOn', { finger: i, velocity: velocityFrom(f.vel), shift: heightShift });
        } else if (f.down && f.curl < off) {
          this.release(i);
        } else if (f.down && o.glide) {
          // relativo ao ponto de partida: soma-se à nota que foi tocada
          f.bend += (dragSemitones(f.y0, wristY) - f.bend) * DRAG_SMOOTH;
          this.emit('glide', { finger: i, pitch: f.bend });
        }
      }
    }
  }

  /** Que regra dispara o dedo i neste fotograma (null = nenhuma). */
  private trigger(
    i: number,
    on: number,
    full: number,
    early: number,
    rest: number,
    dt: number,
    prevDt: number,
    maxRawVel: number,
  ): Trigger | null {
    const f = this.fingers[i];
    // o disparo da v2.1: o `on` sem desconto, com a dobra e a velocidade da v2.1
    if (this.slowCurl[i] > full && this.slowVel[i] > VEL_TRIGGER) return 'full';
    if (f.curl > on && f.vel > VEL_TRIGGER && this.discounted(i, on - rest, dt, prevDt, maxRawVel))
      return 'discount';
    if (this.early(i, early, early - rest, dt, prevDt, maxRawVel)) return 'early';
    return null;
  }

  /** Subida mínima que o tremor do dedo i exige (ver `JITTER_K`). */
  private jitterRise(i: number): number {
    return JITTER_K * Math.sqrt(this.jVar[i]);
  }

  /** Declive médio da dobra crua nos dois últimos fotogramas, ou 0 se não subiu nos dois. */
  private slope2(i: number, dt: number, prevDt: number): number {
    const f = this.fingers[i];
    const pv = this.prevRawVel[i];
    if (prevDt <= 0 || f.rawVel <= 0 || pv <= 0) return 0;
    // um salto isolado (ruído) fica a metade
    return (f.rawVel * dt + pv * prevDt) / (dt + prevDt);
  }

  /**
   * Disparo só pelo desconto (anelar e mindinho entre o `on` e o `on` sem desconto): o dedo subiu
   * pelo menos `rise` desde a linha de base, em `DISCOUNT_MIN_RISES` fotogramas seguidos e com
   * declive nos dois últimos acima de `DISCOUNT_MIN_SLOPE`, e
   * não vai arrastado por um vizinho mais rápido (`COUPLED_DOMINANCE`).
   */
  private discounted(i: number, rise: number, dt: number, prevDt: number, maxRawVel: number) {
    const f = this.fingers[i];
    return (
      f.raw - this.base[i] >= Math.max(rise, this.jitterRise(i)) &&
      this.rises[i] >= DISCOUNT_MIN_RISES &&
      this.slope2(i, dt, prevDt) > DISCOUNT_MIN_SLOPE &&
      f.rawVel >= maxRawVel * COUPLED_DOMINANCE
    );
  }

  /** Disparo antecipado de um dedo (nunca polegares): ver `EARLY_VEL`. */
  private early(
    i: number,
    level: number,
    rise: number,
    dt: number,
    prevDt: number,
    maxRawVel: number,
  ): boolean {
    const f = this.fingers[i];
    if (i % 5 === 0) return false;
    return (
      this.slope2(i, dt, prevDt) > EARLY_VEL &&
      f.raw >= level &&
      f.raw - this.base[i] >= Math.max(rise, this.jitterRise(i)) &&
      f.rawVel >= maxRawVel * EARLY_DOMINANCE
    );
  }

  /** Liberta tudo (mudança de instrumento, polegares, perda da câmara). */
  releaseAll(): void {
    this.fingers.forEach((f, i) => {
      if (f.down) this.emit('noteOff', { finger: i });
      f.down = false;
      f.dwell = 0;
      f.dwellT = 0;
    });
  }

  reset(): void {
    this.releaseAll();
    this.fingers.forEach((f) => Object.assign(f, newFinger()));
    this.handFrames = [0, 0];
    this.armed.fill(false);
  }
}
