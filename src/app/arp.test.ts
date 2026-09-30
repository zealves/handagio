import { describe, expect, it } from 'vitest';
import { ARP_PATTERN, arpCatchUp, arpNote, arpStepDue } from './arp';

describe('arpejo', () => {
  const doMaior = [60, 64, 67];
  it('padrão sobe e desce: n0 n1 n2 n1, e volta ao início', () => {
    expect(ARP_PATTERN).toEqual([0, 1, 2, 1]);
    expect(Array.from({ length: 9 }, (_, k) => arpNote(doMaior, k))).toEqual([
      60, 64, 67, 64, 60, 64, 67, 64, 60,
    ]);
  });
  it('acordes mais curtos não saem do acorde', () => {
    expect(arpNote([60], 2)).toBe(60);
    expect(arpNote([60, 72], 2)).toBe(72);
  });
  it('um passo só toca a nota seguinte a partir de meio passo depois do disparo', () => {
    const step = 0.125; // semicolcheia a 120 BPM
    expect(arpStepDue(10, 10, step)).toBe(false); // o próprio passo do disparo (quantização)
    expect(arpStepDue(10, 9.9, step)).toBe(false); // antes do disparo
    expect(arpStepDue(10, 10.05, step)).toBe(false); // em cima do disparo
    expect(arpStepDue(10, 10.0625, step)).toBe(true);
    expect(arpStepDue(10, 10.125, step)).toBe(true);
  });
  it('recupera os passos já agendados depois do disparo', () => {
    const step = 0.125;
    // relógio com passos em 0, 0.125, …; já emitidos até 10.25 (exclusive)
    expect(arpCatchUp(10.01, 0, step, 10.25)).toEqual([10.125]);
    // em cima de um passo: esse não conta, o seguinte sim
    expect(arpCatchUp(10.0, 0, step, 10.25)).toEqual([10.125]);
    // nada emitido depois do disparo
    expect(arpCatchUp(10.01, 0, step, 10.125)).toEqual([]);
    // disparo quantizado no futuro (10.25), à frente do agendado
    expect(arpCatchUp(10.25, 0, step, 10.25)).toEqual([]);
  });
});
