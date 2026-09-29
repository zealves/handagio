import { describe, expect, it } from 'vitest';
import {
  assignHands,
  createHandAssignState,
  DEFAULT_LABELS_INVERTED,
  mirror,
  ORIENTATION_VOTES,
  toHandedness,
  type Handedness,
} from './handTracker';
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

  it('uma mão: um rótulo confiável vence o lado do ecrã', () => {
    const st = createHandAssignState();
    st.labelsInverted = false;
    const hand = syntheticHand(false, 0.7);
    const [l, r] = assignHands([hand], [{ label: 'Left', score: 0.95 }], st);
    expect(l).toBe(hand);
    expect(r).toBeNull();
  });
  it('sem nada aprendido, o rótulo vem trocado (vídeo sem espelho)', () => {
    expect(DEFAULT_LABELS_INVERTED).toBe(true);
    const hand = syntheticHand(false, 0.7);
    // "Right" do MediaPipe numa imagem não espelhada = mão esquerda do utilizador
    expect(assignHands([hand], [{ label: 'Right', score: 0.9 }])[0]).toBe(hand);
  });
  it('sem rótulo, a continuidade mantém o lado ao atravessar o meio', () => {
    const st = createHandAssignState();
    for (const x of [0.3, 0.4, 0.48, 0.55, 0.62, 0.7]) {
      const hand = syntheticHand(false, x);
      expect(assignHands([hand], [], st)[0]).toBe(hand);
    }
    // um salto grande perde a continuidade: volta ao lado do ecrã
    const far = syntheticHand(false, 0.95);
    assignHands([], [], st);
    expect(assignHands([far], [], st)[1]).toBe(far);
  });
  it('duas mãos ensinam a orientação dos rótulos, nos dois sentidos', () => {
    const left = syntheticHand(false, 0.25);
    const right = syntheticHand(false, 0.75);
    const L: Handedness = { label: 'Left', score: 0.95 };
    const R: Handedness = { label: 'Right', score: 0.95 };
    const st = createHandAssignState();
    assignHands([right, left], [L, R], st); // mão esquerda do ecrã com "Right": trocados
    expect(st.labelsInverted).toBe(true);
    for (let k = 0; k < ORIENTATION_VOTES; k++) assignHands([left, right], [L, R], st);
    expect(st.labelsInverted).toBe(false);
    expect(st.votes.length).toBe(ORIENTATION_VOTES);
    // agora "Left" é a esquerda, mesmo na metade direita do ecrã
    const lone = syntheticHand(false, 0.8);
    expect(assignHands([lone], [L], st)[0]).toBe(lone);
    // rótulos iguais ou pouco confiáveis não votam
    const st2 = createHandAssignState();
    assignHands([left, right], [L, L], st2);
    assignHands([left, right], [L, { label: 'Right', score: 0.5 }], st2);
    expect(st2.labelsInverted).toBeNull();
  });
  it('um rótulo com score baixo é ignorado', () => {
    const st = createHandAssignState();
    st.labelsInverted = false;
    const hand = syntheticHand(false, 0.7);
    expect(assignHands([hand], [{ label: 'Left', score: 0.6 }], st)[1]).toBe(hand);
  });
  it('converte as categorias do MediaPipe', () => {
    expect(
      toHandedness([[{ categoryName: 'Left', score: 0.9 }], [], [{ categoryName: 'x', score: 1 }]]),
    ).toEqual([{ label: 'Left', score: 0.9 }, null, null]);
  });
});
