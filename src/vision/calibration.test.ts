import { describe, expect, it } from 'vitest';
import { CalibrationCollector } from './calibration';
import { thresholds } from './gestureEngine';

describe('calibração', () => {
  it('calcula referências por dedo e ignora extremos', () => {
    const c = new CalibrationCollector();
    for (let k = 0; k < 20; k++) {
      c.add('open', new Array(10).fill(0.1 + (k === 0 ? 0.8 : 0)));
      c.add('closed', new Array(10).fill(0.7));
    }
    const { calibration, fingers } = c.result();
    expect(fingers).toBe(10);
    expect(calibration.open[3]).toBeCloseTo(0.1);
    expect(calibration.closed[3]).toBeCloseTo(0.7);
  });

  it('dedos sem diferença clara não são calibrados', () => {
    const c = new CalibrationCollector();
    for (let k = 0; k < 10; k++) {
      c.add('open', [0.3, null, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
      c.add('closed', [0.4, null, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8]);
    }
    const { calibration, fingers } = c.result();
    expect(fingers).toBe(8);
    // polegar com pouca diferença → volta à fórmula da sensibilidade
    expect(thresholds(0, 0.55, calibration)).toEqual(thresholds(0, 0.55, null));
    // dedo calibrado: limiar entre esticado e dobrado
    const t = thresholds(2, 0.55, calibration);
    expect(t.on).toBeGreaterThan(0.3);
    expect(t.on).toBeLessThan(0.8);
    expect(t.off).toBeLessThan(t.on);
    expect(t.off).toBeGreaterThan(0.3);
  });
});
