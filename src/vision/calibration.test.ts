import { describe, expect, it } from 'vitest';
import { CalibrationCollector } from './calibration';
import { thresholds, THUMB_HYSTERESIS, thumbThresholds } from './gestureEngine';
import { curls } from './fingerCurl';
import { syntheticHand } from './testHands';

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

  it('polegares: afastado no passo esticado e encostado ao indicador no passo dobrado', () => {
    const c = new CalibrationCollector();
    const at = (closed: boolean, thumb: number) => [
      ...curls(syntheticHand(closed, 0.3, 0.8, { thumb })),
      ...curls(syntheticHand(closed, 0.7, 0.8, { thumb })),
    ];
    for (let k = 0; k < 20; k++) {
      c.add('open', at(false, k % 2 ? 0.1 : 0));
      c.add('closed', at(true, k % 2 ? 0.9 : 1));
    }
    const { calibration, fingers } = c.result();
    expect(fingers).toBe(10);
    for (const i of [0, 5]) {
      expect(calibration.open[i]).toBeLessThan(0.05);
      expect(calibration.closed[i]).toBeGreaterThan(0.9);
      const t = thumbThresholds(i, 0.5, calibration);
      const span = calibration.closed[i] - calibration.open[i];
      expect(t.on).toBeCloseTo(calibration.open[i] + span * 0.6);
      expect(t.off).toBeCloseTo(t.on - THUMB_HYSTERESIS);
    }
  });
});
