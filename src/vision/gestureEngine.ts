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
 * - a dobra crua subiu, desde a linha de base (`BASELINE_S`), o que falta do repouso do próprio dedo
 *   até esse nível (ver `REST_WINDOW_S`), e pelo menos `JITTER_K` × o seu tremor;
 * - `EARLY_MIN_RISES` fotogramas seguidos a subir;
 * - este dedo a mexer-se pelo menos `EARLY_DOMINANCE` × o outro dedo mais rápido da mesma mão
 *   nos últimos `COUPLED_HISTORY` fotogramas (quando se dobra o anelar, o mindinho e o médio vão
 *   atrás, mais devagar e um pouco depois, e não disparam antecipados).
 * Só dedos, nunca polegares.
 */
export const EARLY_VEL = 3;
export const EARLY_FRACTION = 0.7;
export const EARLY_DOMINANCE = 0.6;
/**
 * Movimento acoplado: um anelar ou mindinho que só passa o `on` graças ao desconto (entre o `on`
 * e o `on` sem desconto), ou que dispara antecipado, só dispara se estiver a subir a pelo menos
 * `COUPLED_DOMINANCE` × o outro dedo mais rápido da mesma mão nos últimos `COUPLED_HISTORY`
 * fotogramas, e se tiver subido pelo menos `COUPLED_RISE_RATIO` × o que subiu o outro dedo que
 * mais subiu no mesmo intervalo (ver `notDragged`). Dobrar o anelar arrasta o mindinho (e
 * vice-versa) mais devagar e um pouco depois: esse arrasto não toca; o mindinho dobrado de
 * propósito toca. O disparo da v2.1 (o `on` sem desconto) não tem esta guarda, como na v2.1.
 */
export const COUPLED_DOMINANCE = 0.6;
/**
 * Movimento acoplado: fotogramas de velocidade dos outros dedos que contam. O dedo arrastado vai
 * 1–2 fotogramas atrás do que dobra; comparar só com o fotograma atual deixava-o passar quando o
 * anelar já abrandava (revisão, ronda 3). Com 4 fotogramas também apanha 2 de atraso.
 */
export const COUPLED_HISTORY = 4;
/**
 * Movimento acoplado: fração mínima da subida do outro dedo que mais subiu (ver `notDragged`).
 * Mais alta do que `COUPLED_DOMINANCE`, porque com ruído a razão das subidas oscila: com 0.6, um
 * mindinho a acompanhar 55% do anelar ainda passava às vezes.
 */
export const COUPLED_RISE_RATIO = 0.7;
/**
 * Fotogramas depois de uma mão aparecer (ou trocar de lado) em que nenhum dedo dispara, além do
 * portão `armed`: os primeiros pontos de uma mão que entra são instáveis.
 */
export const ENTRY_IGNORE_FRAMES = 4;
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
 * Repouso de cada dedo: o mínimo da dobra crua no último `REST_WINDOW_S`. O disparo antecipado e
 * o disparo só pelo desconto pedem que o dedo suba desde a linha de base o que falta do seu
 * repouso até ao nível (e nunca menos de `RISE_MIN`): um mindinho que repousa a 0.10 não tem de
 * subir como se repousasse a 0.
 */
export const REST_WINDOW_S = 1;
export const RISE_MIN = 0.12;
/**
 * Disparo antecipado: fotogramas seguidos com a dobra crua a subir. Com 2, um salto de dois
 * fotogramas da deteção (oclusão) até 0.55 tocava, e a v2.1 não; com 3 fica igual à v2.1.
 */
export const EARLY_MIN_RISES = 3;
/**
 * Tremor de cada dedo, robusto: a dispersão da parte de baixo das dobras cruas dos últimos
 * `JITTER_WINDOW` fotogramas com o dedo solto (`JITTER_LO_PCT`..`JITTER_HI_PCT`), convertida em
 * desvio-padrão para ruído gaussiano. Um movimento (uma dobra que não tocou, um vizinho a arrastar
 * o dedo) só junta valores altos e quase não mexe na parte de baixo; o valor não se alimenta de si próprio e não
 * fica preso. Não conta com o dedo em baixo nem `JITTER_HOLD_S` depois de soltar (o dedo a
 * esticar). Nunca passa de `JITTER_MAX`; até haver `JITTER_MIN_SAMPLES` vale `JITTER_START`. O
 * disparo antecipado e o disparo só pelo desconto exigem uma subida de pelo menos `JITTER_K` ×
 * esse tremor: com uma deteção muito tremida, só fica o disparo da v2.1.
 */
export const JITTER_WINDOW = 60;
export const JITTER_K = 14;
export const JITTER_START = 0.03;
export const JITTER_MIN_SAMPLES = 15;
export const JITTER_HOLD_S = 0.4;
export const JITTER_MAX = 0.035;
/**
 * Percentis da parte de baixo das dobras usados para o tremor, e a distância entre eles numa
 * normal (em desvios-padrão): P30 − P5 = 1.121 σ. Só a parte de baixo, porque os movimentos
 * (dobras, vizinhos a arrastar o dedo) só juntam valores altos; aguenta até ~70% da janela com
 * movimento.
 */
export const JITTER_LO_PCT = 0.05;
export const JITTER_HI_PCT = 0.3;
const JITTER_SPREAD = 1.121;
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
  /** Velocidades cruas dos últimos `COUPLED_HISTORY` fotogramas de cada dedo. */
  private velHist = Array.from({ length: 10 }, () => [] as number[]);
  /** Diagnóstico e testes: a regra do último disparo de cada dedo. */
  readonly lastTrigger: (Trigger | null)[] = new Array(10).fill(null);
  /** Fotogramas seguidos com a dobra crua a subir, e a dobra crua antes de começar a subir. */
  private rises = new Array<number>(10).fill(0);
  private runStart = new Array<number>(10).fill(0);
  /** Tremor de cada dedo (ver `JITTER_WINDOW`): dobras cruas recentes e o desvio estimado. */
  private jDelta = Array.from({ length: 10 }, () => new Float32Array(JITTER_WINDOW));
  private jCount = new Array<number>(10).fill(0);
  private jPos = new Array<number>(10).fill(0);
  private jSd = new Array<number>(10).fill(JITTER_START);
  /** Segundos desde a última nota ou subida clara de cada dedo (ver `JITTER_HOLD_S`). */
  private sinceOff = new Array<number>(10).fill(Infinity);
  /** Repouso de cada dedo (ver `REST_WINDOW_S`). */
  private slowRest = new Array<number>(10).fill(0);
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
          this.velHist[i].length = 0;
          this.jCount[i] = 0;
          this.jPos[i] = 0;
          this.jSd[i] = JITTER_START;
          this.slowRest[i] = raw;
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
          const vh = this.velHist[i];
          vh.push(f.rawVel);
          if (vh.length > COUPLED_HISTORY) vh.shift();
          // início da subida atual: a dobra crua antes do primeiro fotograma a subir
          if (f.rawVel <= 0) this.rises[i] = 0;
          else if (this.rises[i]++ === 0) this.runStart[i] = f.raw;
        }
        // linha de base: mínimo das dobras cruas dos últimos BASELINE_S (sem a deste fotograma)
        hv.push(f.raw);
        ha.push(0);
        for (let k = 0; k < ha.length; k++) ha[k] += dt;
        while (ha.length > 1 && ha[0] > REST_WINDOW_S + 1e-9) {
          ha.shift();
          hv.shift();
        }
        let near = Infinity;
        let all = Infinity;
        for (let k = 0; k < hv.length; k++) {
          all = Math.min(all, hv[k]);
          if (ha[k] <= BASELINE_S + 1e-9) near = Math.min(near, hv[k]);
        }
        this.slowRest[i] = all;
        // tremor: só com o dedo solto e longe de uma nota
        this.sinceOff[i] = f.down ? 0 : this.sinceOff[i] + dt;
        if (j > 0 && this.sinceOff[i] >= JITTER_HOLD_S) this.sampleJitter(i, raw);
        // a subida conta desde o mais alto de: o mínimo recente e o início da subida atual
        this.base[i] = Math.max(near, j > 0 && this.rises[i] > 0 ? this.runStart[i] : 0);
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
          this.handFrames[h] > ENTRY_IGNORE_FRAMES &&
          (this.lastTrigger[i] = this.trigger(
            i,
            on,
            full,
            early,
            rest,
            dt,
            prevDt,
            this.fastestOther(h, j),
            // com um limiar aprendido, o disparo da v2.1 fica no `on` da v2.1 (ver `trigger`)
            o.learn && !calibrated(i, o.calibration) && usableRange(this.adaptive.ranges[i])
              ? defaultThresholds(i, o.sensitivity).full
              : 0,
          ))
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
    minFull: number,
  ): Trigger | null {
    const f = this.fingers[i];
    const free = () => this.notDragged(Math.floor(i / 5), i % 5);
    // o disparo da v2.1: o `on` sem desconto, com a dobra e a velocidade da v2.1. Com um limiar
    // aprendido nunca abaixo do da v2.1 (`minFull`): a aprendizagem só facilita pelas regras novas,
    // que pedem uma subida de verdade e não deixam passar um dedo arrastado; sem isto, o mindinho
    // arrastado pelo anelar e a postura que sobe aos poucos voltavam a tocar (revisão, ronda 3)
    if (this.slowCurl[i] > Math.max(full, minFull) && this.slowVel[i] > VEL_TRIGGER) return 'full';
    // repouso do dedo: o de referência (0, calibrado ou aprendido) ou o medido, se for mais alto
    const r = Math.max(rest, this.slowRest[i]);
    const need = (level: number) => Math.max(RISE_MIN, level - r);
    if (
      f.curl > on &&
      f.vel > VEL_TRIGGER &&
      this.discounted(i, need(on), dt, prevDt, maxRawVel) &&
      free()
    )
      return 'discount';
    if (this.early(i, early, need(early), dt, prevDt, maxRawVel) && free()) return 'early';
    return null;
  }

  /** Uma dobra crua do dedo i solto para a estimativa do tremor. */
  private sampleJitter(i: number, d: number): void {
    const w = this.jDelta[i];
    w[this.jPos[i]] = d;
    this.jPos[i] = (this.jPos[i] + 1) % JITTER_WINDOW;
    const n = (this.jCount[i] = Math.min(JITTER_WINDOW, this.jCount[i] + 1));
    if (n < JITTER_MIN_SAMPLES) return;
    const sorted = Array.from(w.subarray(0, n)).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.round(p * (n - 1))];
    this.jSd[i] = (q(JITTER_HI_PCT) - q(JITTER_LO_PCT)) / JITTER_SPREAD;
  }

  /** Velocidade crua mais alta dos outros dedos da mão h nos últimos `COUPLED_HISTORY` fotogramas. */
  /** Subida da dobra crua do dedo i nos últimos n fotogramas (desde o mínimo). */
  private riseOver(i: number, n: number): number {
    const hv = this.histV[i];
    let m = this.fingers[i].raw;
    for (let k = Math.max(0, hv.length - n); k < hv.length; k++) m = Math.min(m, hv[k]);
    return this.fingers[i].raw - m;
  }

  /**
   * Guarda do movimento acoplado para o dedo j da mão h: a subida dele nos últimos fotogramas (os
   * da subida atual, e pelo menos `COUPLED_HISTORY`) é pelo menos `COUPLED_RISE_RATIO` × a do outro
   * dedo que mais subiu. Um mindinho arrastado pelo anelar sobe só uma fração do que o anelar sobe,
   * mesmo que vá atrasado e já o esteja a ultrapassar em velocidade.
   */
  private notDragged(h: number, j: number): boolean {
    const i = h * 5 + j;
    const n = Math.max(COUPLED_HISTORY, this.rises[i] + 1);
    let other = 0;
    for (let q = 1; q < 5; q++) if (q !== j) other = Math.max(other, this.riseOver(h * 5 + q, n));
    return this.riseOver(i, n) >= other * COUPLED_RISE_RATIO;
  }

  private fastestOther(h: number, j: number): number {
    let m = 0;
    for (let q = 1; q < 5; q++)
      if (q !== j) for (const v of this.velHist[h * 5 + q]) m = Math.max(m, v);
    return m;
  }

  /** Tremor do dedo i (ver `JITTER_MAX`). */
  private jitter(i: number): number {
    return Math.min(JITTER_MAX, this.jSd[i]);
  }

  /** Subida mínima que o tremor do dedo i exige (ver `JITTER_K`). */
  private jitterRise(i: number): number {
    return JITTER_K * this.jitter(i);
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
   * não vai arrastado por um vizinho mais rápido (`COUPLED_DOMINANCE`, com `maxRawVel` o outro dedo
   * mais rápido nos últimos `COUPLED_HISTORY` fotogramas).
   */
  private discounted(i: number, rise: number, dt: number, prevDt: number, maxRawVel: number) {
    const f = this.fingers[i];
    return (
      f.raw - this.base[i] >= Math.max(rise, this.jitterRise(i)) &&
      this.rises[i] >= DISCOUNT_MIN_RISES &&
      this.slope2(i, dt, prevDt) > DISCOUNT_MIN_SLOPE &&
      f.rawVel > 0 &&
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
      this.rises[i] >= EARLY_MIN_RISES &&
      this.slope2(i, dt, prevDt) > EARLY_VEL &&
      f.raw >= level &&
      f.raw - this.base[i] >= Math.max(rise, this.jitterRise(i)) &&
      f.rawVel > 0 &&
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
