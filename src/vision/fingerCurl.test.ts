import { describe, expect, it } from 'vitest';
import { angleAt, curls } from './fingerCurl';
import { syntheticHand } from './testHands';

describe('fingerCurl', () => {
  it('ângulo reto e raso', () => {
    const a = { x: 0, y: 0, z: 0 };
    expect(angleAt({ x: 1, y: 0, z: 0 }, a, { x: -1, y: 0, z: 0 })).toBeCloseTo(180);
    expect(angleAt({ x: 1, y: 0, z: 0 }, a, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
  });

  it('mão aberta dá dobras perto de 0', () => {
    const c = curls(syntheticHand(false));
    expect(c).toHaveLength(5);
    c.slice(1).forEach((v) => expect(v).toBeLessThan(0.15));
    expect(c[0]).toBeLessThan(0.3);
  });

  it('mão fechada dá dobras altas', () => {
    const c = curls(syntheticHand(true));
    c.slice(1).forEach((v) => expect(v).toBeGreaterThan(0.7));
    expect(c[0]).toBeGreaterThan(0.5);
  });

  it('só o dedo dobrado sobe', () => {
    const c = curls(syntheticHand([false, false, true, false, false]));
    expect(c[2]).toBeGreaterThan(0.7);
    expect(c[1]).toBeLessThan(0.15);
    expect(c[3]).toBeLessThan(0.15);
  });

  it('valores sempre entre 0 e 1', () => {
    for (const v of [...curls(syntheticHand(true)), ...curls(syntheticHand(false))]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
