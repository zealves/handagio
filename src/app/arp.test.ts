import { describe, expect, it } from 'vitest';
import {
  ARP_PATTERN,
  arpCatchUp,
  arpKeysToCancel,
  arpNote,
  arpNoteSounds,
  arpStepDue,
} from './arp';

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
  it('a 1.ª nota soa sempre, mesmo depois de soltar; as seguintes só com o dedo dobrado', () => {
    expect(arpNoteSounds(0, false)).toBe(true);
    expect(arpNoteSounds(0, true)).toBe(true);
    expect(arpNoteSounds(1, false)).toBe(false);
    expect(arpNoteSounds(5, true)).toBe(true);
  });
  it('ao soltar, nunca se corta a chave que guarda a 1.ª nota', () => {
    // só a 1.ª nota (toque curto quantizado): nada a cortar
    expect(arpKeysToCancel(1)).toEqual([]);
    // notas 0 e 1 (a 2.ª já recuperada): corta-se só a 2.ª
    expect(arpKeysToCancel(2)).toEqual([1]);
    expect(arpKeysToCancel(3)).toEqual([1, 2]);
    // a chave 0 já foi reutilizada pela 4.ª nota: pode cortar-se
    expect(arpKeysToCancel(4)).toEqual([0, 1, 2]);
    expect(arpKeysToCancel(0)).toEqual([]);
  });
});
