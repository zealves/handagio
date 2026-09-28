import { describe, expect, it } from 'vitest';
import { assignHands, mirror } from './handTracker';
import { syntheticHand } from './testHands';

describe('handTracker', () => {
  it('espelha as coordenadas', () => {
    expect(mirror([{ x: 0.2, y: 0.3, z: 0 }])[0].x).toBeCloseTo(0.8);
  });
  it('duas mãos: lado pela posição do pulso', () => {
    const a = syntheticHand(false, 0.8);
    const b = syntheticHand(false, 0.2);
    const [l, r] = assignHands([a, b]);
    expect(l).toBe(b);
    expect(r).toBe(a);
  });
  it('uma mão: lado do ecrã', () => {
    expect(assignHands([syntheticHand(false, 0.3)])[1]).toBeNull();
    expect(assignHands([syntheticHand(false, 0.7)])[0]).toBeNull();
    expect(assignHands([])).toEqual([null, null]);
  });
});
