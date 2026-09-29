import { describe, expect, it } from 'vitest';
import { Looper } from './looper';

const note = (midi: number) => ({
  kind: 'note' as const,
  midi,
  vel: 0.8,
  instrument: 'piano',
  pan: 0,
  dur: 1,
});

describe('looper', () => {
  it('arma, grava um compasso e passa a tocar', () => {
    const l = new Looper();
    l.arm(16, 1);
    expect(l.state).toBe('armed');
    l.advance(16);
    expect(l.state).toBe('recording');
    l.record(18, note(60));
    l.record(20.5, note(62));
    expect(l.advance(32)).toBe(true);
    expect(l.state).toBe('playing');
    expect(l.eventCount).toBe(2);
    // no ciclo seguinte, o evento do passo 2 volta a sair no passo 34
    expect(l.eventsAt(34).map((e) => e.ev.kind === 'note' && e.ev.midi)).toEqual([60]);
    expect(l.eventsAt(36)[0].offset).toBeCloseTo(0.5);
  });

  it('não grava antes do início', () => {
    const l = new Looper();
    l.arm(16, 1);
    l.record(10, note(60));
    l.advance(16);
    l.advance(32);
    expect(l.eventCount).toBe(0);
    expect(l.state).toBe('playing');
  });

  it('grava notas do fim do compasso mesmo depois de o estado mudar', () => {
    const l = new Looper();
    l.arm(0, 1);
    l.advance(0);
    l.advance(16); // o relógio já agendou o passo 16 (100 ms antes)
    l.record(15.6, note(72)); // mas a nota soou antes do fim
    expect(l.eventCount).toBe(1);
    expect(l.eventsAt(15)).toEqual([]); // ainda na 1.ª volta
    expect(l.eventsAt(31)).toHaveLength(1);
  });

  it('overdub acrescenta camadas; desfazer remove a última', () => {
    const l = new Looper();
    l.arm(0, 1);
    l.advance(0);
    l.record(1, note(60));
    l.advance(16);
    l.startOverdub();
    l.record(20, note(64));
    l.stopOverdub(30);
    expect(l.layers).toHaveLength(2);
    expect(l.eventsAt(36)).toHaveLength(1);
    l.undo();
    expect(l.layers).toHaveLength(1);
    expect(l.eventsAt(36)).toHaveLength(0);
    expect(l.eventsAt(17)).toHaveLength(1);
  });

  it('duração das notas sustentadas', () => {
    const l = new Looper();
    l.arm(0, 1);
    l.advance(0);
    l.record(2, { ...note(60), key: 'f1' });
    l.release(6, 'f1');
    l.advance(16);
    const ev = l.layers[0][0];
    expect(ev.kind === 'note' && ev.dur).toBe(4);
  });

  it('limpar volta ao início', () => {
    const l = new Looper();
    l.arm(0, 2);
    l.advance(0);
    l.record(1, note(60));
    l.advance(32);
    l.clear();
    expect(l.state).toBe('idle');
    expect(l.eventsAt(33)).toEqual([]);
  });
});
