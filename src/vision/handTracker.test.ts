import { describe, expect, it } from 'vitest';
import {
  assignHands,
  createHandAssignState,
  DEFAULT_LABELS_INVERTED,
  LABEL_SWITCH_FRAMES,
  mirror,
  PREV_KEEP_FRAMES,
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
    // agora "Left" é a esquerda, mesmo na metade direita do ecrã (mão nova, sem continuidade)
    const lone = syntheticHand(false, 0.8);
    expect(assignHands([lone], [L], { ...st, prev: [null, null] })[0]).toBe(lone);
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
  describe('histerese do rótulo', () => {
    const L: Handedness = { label: 'Left', score: 0.95 };
    const R: Handedness = { label: 'Right', score: 0.95 };
    /** Estado com uma mão direita seguida em x = 0.7 e rótulos na orientação direta. */
    const tracked = () => {
      const st = createHandAssignState();
      st.labelsInverted = false;
      const hand = syntheticHand(false, 0.7);
      expect(assignHands([hand], [R], st)[1]).toBe(hand);
      return st;
    };
    it('1 ou 2 fotogramas a contradizer mantêm o lado', () => {
      const st = tracked();
      const hand = syntheticHand(false, 0.7);
      for (let k = 1; k < LABEL_SWITCH_FRAMES; k++)
        expect(assignHands([hand], [L], st)[1]).toBe(hand);
      // o rótulo volta a concordar: a contagem recomeça
      expect(assignHands([hand], [R], st)[1]).toBe(hand);
      expect(st.disagree).toBe(0);
      for (let k = 1; k < LABEL_SWITCH_FRAMES; k++)
        expect(assignHands([hand], [L], st)[1]).toBe(hand);
      // um fotograma sem rótulo confiável também recomeça a contagem
      expect(assignHands([hand], [{ label: 'Left', score: 0.5 }], st)[1]).toBe(hand);
      expect(st.disagree).toBe(0);
    });
    it('3 fotogramas seguidos a contradizer mudam o lado, que depois fica', () => {
      const st = tracked();
      const hand = syntheticHand(false, 0.7);
      for (let k = 1; k < LABEL_SWITCH_FRAMES; k++) assignHands([hand], [L], st);
      expect(assignHands([hand], [L], st)[0]).toBe(hand);
      expect(st.disagree).toBe(0);
      // já do lado novo: sem rótulo, a continuidade mantém-no
      expect(assignHands([hand], [], st)[0]).toBe(hand);
    });
    it('uma mão nova com rótulo decide-se logo pelo rótulo', () => {
      const st = createHandAssignState();
      st.labelsInverted = false;
      const hand = syntheticHand(false, 0.7);
      expect(assignHands([hand], [L], st)[0]).toBe(hand);
    });
    it('caso do utilizador: mão esquerda sozinha na metade direita desde o 1.º fotograma', () => {
      const st = createHandAssignState();
      for (const x of [0.7, 0.72, 0.74]) {
        const hand = syntheticHand([false, false, false, false, true], x);
        // "Right" do MediaPipe numa imagem sem espelho = mão esquerda
        expect(assignHands([hand], [R], st)[0]).toBe(hand);
      }
    });
  });
  it('a continuidade sobrevive a alguns fotogramas sem mão, mas não a muitos', () => {
    const st = createHandAssignState();
    assignHands([syntheticHand(false, 0.45)], [], st); // esquerda (lado do ecrã)
    for (let k = 0; k < PREV_KEEP_FRAMES; k++) assignHands([], [], st);
    const back = syntheticHand(false, 0.55);
    expect(assignHands([back], [], st)[0]).toBe(back);
    for (let k = 0; k <= PREV_KEEP_FRAMES; k++) assignHands([], [], st);
    const late = syntheticHand(false, 0.55);
    expect(assignHands([late], [], st)[1]).toBe(late);
  });
  it('marca os lados que trocaram de mão (pelos pulsos esperados, com a velocidade)', () => {
    const L = (x: number) => syntheticHand(false, x);
    const st = createHandAssignState();
    assignHands([L(0.3), L(0.7)], [], st);
    assignHands([L(0.32), L(0.69)], [], st);
    expect(st.swapped).toEqual([false, false]);
    // a mão esquerda salta para perto da outra: continua a ser a esquerda
    assignHands([L(0.6), L(0.69)], [], st);
    expect(st.swapped).toEqual([false, false]);
    // as duas mãos juntas a mexer-se depressa para o mesmo lado não trocam
    const par = createHandAssignState();
    for (let k = 0; k < 6; k++) {
      assignHands([L(0.2 + 0.12 * k), L(0.3 + 0.12 * k)], [], par);
      expect(par.swapped).toEqual([false, false]);
    }
    // as mãos cruzam-se: depois de se cruzarem, cada lado fica com a outra mão
    const cr = createHandAssignState();
    for (const [a, b] of [
      [0.3, 0.7],
      [0.4, 0.6],
      [0.5, 0.5],
    ])
      assignHands([L(a), L(b)], [], cr);
    assignHands([L(0.6), L(0.4)], [], cr);
    expect(cr.swapped).toEqual([true, true]);
    // uma mão nova num lado vazio não é uma troca (o gestureEngine já a trata como nova)
    const st2 = createHandAssignState();
    assignHands([L(0.3)], [], st2);
    expect(st2.swapped).toEqual([false, false]);
    // salto grande no mesmo lado (mão a mexer-se depressa) não é uma troca
    assignHands([L(0.05)], [], st2);
    expect(st2.swapped).toEqual([false, false]);
  });
});
