// Calibração: recolhe as dobras de cada dedo com a mão esticada e depois dobrada, e devolve os
// valores de referência que o gestureEngine usa para ajustar os limiares de cada utilizador.
import type { Calibration } from '../state/types';

export type CalPhase = 'open' | 'closed';

export class CalibrationCollector {
  private samples: Record<CalPhase, number[][]> = {
    open: Array.from({ length: 10 }, () => []),
    closed: Array.from({ length: 10 }, () => []),
  };

  /** Uma amostra: dobras dos 10 dedos (null = dedo não visto). */
  add(phase: CalPhase, curls: (number | null)[]): void {
    curls.forEach((c, i) => {
      if (c !== null) this.samples[phase][i].push(c);
    });
  }

  /** Mediana robusta: ignora os 20% mais extremos de cada lado. */
  private static trimmedMean(v: number[]): number | null {
    if (v.length < 3) return null;
    const s = [...v].sort((a, b) => a - b);
    const k = Math.floor(s.length * 0.2);
    const mid = s.slice(k, s.length - k);
    return mid.reduce((a, b) => a + b, 0) / mid.length;
  }

  /**
   * Resultado; dedos sem amostras suficientes ou sem diferença clara ficam com os valores
   * neutros (0 e 1), que fazem o gestureEngine usar a fórmula da sensibilidade.
   */
  result(): { calibration: Calibration; fingers: number } {
    const open: number[] = [];
    const closed: number[] = [];
    let ok = 0;
    for (let i = 0; i < 10; i++) {
      const o = CalibrationCollector.trimmedMean(this.samples.open[i]);
      const c = CalibrationCollector.trimmedMean(this.samples.closed[i]);
      if (o !== null && c !== null && c - o > 0.2) {
        open.push(o);
        closed.push(c);
        ok++;
      } else {
        open.push(0);
        closed.push(0);
      }
    }
    return { calibration: { open, closed }, fingers: ok };
  }
}
