// Aprendizagem contínua do intervalo de dobra de cada dedo (auto-calibração enquanto se toca).
// Lógica pura: guarda só números (histogramas das dobras cruas), nunca imagens.
//
// Cada dedo tem uma janela deslizante das últimas `LEARN_WINDOW` dobras cruas, num histograma
// com resolução de 0,01. Dessa janela saem os percentis `LEARN_LO_PCT` (mão esticada) e
// `LEARN_HI_PCT` (dedo dobrado); o intervalo aprendido [lo, hi] segue-os devagar (EMA). Os
// limiares que o gestureEngine tira daqui estão em `learnedThresholds` (gestureEngine.ts).

/** Amostras por dedo na janela: ~20 s a 30 fps de deteção (~30 s a 20 fps). */
export const LEARN_WINDOW = 600;
/** Amostras mínimas na janela antes de o intervalo aprendido mudar. */
export const LEARN_MIN_SAMPLES = 60;
/**
 * Diferença mínima entre os percentis da janela (e entre `lo` e `hi` aprendidos) para a
 * aprendizagem contar. Uma janela só com a mão parada (esticada ou dobrada) fica abaixo disto e
 * não mexe no aprendido: uma sessão de "mão aberta sem tocar" não deixa os dedos hipersensíveis.
 */
export const LEARN_MIN_SPAN = 0.25;
/** Percentil da janela que representa o dedo esticado. */
export const LEARN_LO_PCT = 0.1;
/** Percentil da janela que representa o dedo dobrado. */
export const LEARN_HI_PCT = 0.9;
/** Fotogramas ignorados depois de uma mão aparecer (os primeiros pontos são instáveis). */
export const LEARN_SKIP_FRAMES = 5;
/** Confiança mínima da lateralidade (score do MediaPipe) para aprender com uma mão. */
export const LEARN_MIN_SCORE = 0.8;
/**
 * Constante de tempo (s) da EMA quando o limite muda no sentido que torna o dedo MENOS
 * sensível (lo ou hi a subir): segue depressa.
 */
export const LEARN_TAU_SAFE_S = 3;
/**
 * Constante de tempo (s) da EMA quando o limite muda no sentido que torna o dedo MAIS
 * sensível (lo ou hi a descer): segue devagar.
 */
export const LEARN_TAU_RISKY_S = 20;

const BINS = 101; // 0.00 … 1.00

export interface LearnedRange {
  lo: number;
  hi: number;
}

/** Arredonda para guardar nas preferências (2 casas). */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Valida um intervalo vindo das preferências (null se inválido). */
export function validRange(r: unknown): LearnedRange | null {
  if (!r || typeof r !== 'object') return null;
  const { lo, hi } = r as Record<string, unknown>;
  if (typeof lo !== 'number' || typeof hi !== 'number') return null;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || hi > 1 || hi <= lo) return null;
  return { lo, hi };
}

/** Normaliza a lista guardada: 10 entradas, cada uma um intervalo válido ou null. */
export function normalizeRanges(v: unknown): (LearnedRange | null)[] | null {
  if (!Array.isArray(v)) return null;
  const out = Array.from({ length: 10 }, (_, i) => validRange(v[i]));
  return out.some(Boolean) ? out : null;
}

/** Intervalo aprendido utilizável (existe e é largo o suficiente). */
export const usableRange = (r: LearnedRange | null | undefined): r is LearnedRange =>
  !!r && r.hi - r.lo > LEARN_MIN_SPAN;

/** Janela deslizante de dobras de um dedo, com histograma para os percentis. */
class Window {
  private ring = new Uint8Array(LEARN_WINDOW);
  private hist = new Uint16Array(BINS);
  private pos = 0;
  count = 0;

  add(v: number): void {
    const b = Math.max(0, Math.min(BINS - 1, Math.round(v * 100)));
    if (this.count === LEARN_WINDOW) this.hist[this.ring[this.pos]]--;
    else this.count++;
    this.ring[this.pos] = b;
    this.hist[b]++;
    this.pos = (this.pos + 1) % LEARN_WINDOW;
  }

  /** Percentil p (0..1) da janela, com a resolução do histograma. */
  percentile(p: number): number {
    const need = Math.max(1, Math.ceil(p * this.count));
    let acc = 0;
    for (let b = 0; b < BINS; b++) {
      acc += this.hist[b];
      if (acc >= need) return b / 100;
    }
    return 1;
  }

  clear(): void {
    this.hist.fill(0);
    this.pos = 0;
    this.count = 0;
  }
}

/** EMA assimétrica: devagar no sentido `risky`, depressa no outro. */
function follow(cur: number, target: number, dt: number, riskyWhenDown: boolean): number {
  const down = target < cur;
  const tau = down === riskyWhenDown ? LEARN_TAU_RISKY_S : LEARN_TAU_SAFE_S;
  return cur + (target - cur) * (1 - Math.exp(-dt / tau));
}

/** Intervalos aprendidos dos 10 dedos. */
export class AdaptiveRanges {
  readonly ranges: (LearnedRange | null)[] = new Array(10).fill(null);
  private windows = Array.from({ length: 10 }, () => new Window());
  /** Sobe sempre que um intervalo muda (para a sessão saber quando guardar). */
  version = 0;

  /** Amostras na janela de um dedo. */
  samples(i: number): number {
    return this.windows[i].count;
  }

  /** Percentis atuais da janela de um dedo (para testes e diagnóstico). */
  windowRange(i: number): LearnedRange {
    const w = this.windows[i];
    return { lo: w.percentile(LEARN_LO_PCT), hi: w.percentile(LEARN_HI_PCT) };
  }

  /**
   * Uma observação da dobra crua do dedo i (0..1). `dt` em segundos. O chamador só observa
   * mãos confiáveis e já estáveis (ver `LEARN_SKIP_FRAMES`, `LEARN_MIN_SCORE`).
   */
  observe(i: number, raw: number, dt: number): void {
    const w = this.windows[i];
    w.add(raw);
    if (w.count < LEARN_MIN_SAMPLES) return;
    const lo = w.percentile(LEARN_LO_PCT);
    const hi = w.percentile(LEARN_HI_PCT);
    if (hi - lo < LEARN_MIN_SPAN) return;
    const r = this.ranges[i];
    if (!r) {
      this.ranges[i] = { lo, hi };
    } else {
      // lo a descer ou hi a descer baixam o limiar (mais sensível): devagar
      r.lo = follow(r.lo, lo, dt, true);
      r.hi = follow(r.hi, hi, dt, true);
    }
    this.version++;
  }

  /** Carrega os intervalos guardados (as janelas recomeçam vazias). */
  load(ranges: readonly (LearnedRange | null)[] | null | undefined): void {
    for (let i = 0; i < 10; i++) {
      const r = validRange(ranges?.[i]);
      this.ranges[i] = r ? { ...r } : null;
      this.windows[i].clear();
    }
    this.version++;
  }

  /** Esquece tudo. */
  reset(): void {
    this.load(null);
  }

  /** Cópia arredondada para guardar (null se não houver nada aprendido). */
  snapshot(): (LearnedRange | null)[] | null {
    const out = this.ranges.map((r) => (r ? { lo: round2(r.lo), hi: round2(r.hi) } : null));
    return out.some(Boolean) ? out : null;
  }
}
