import { describe, expect, it } from 'vitest';
import { gameStartBar, GameRun } from './run';
import type { BackingEvent, Chart } from './types';

const chart: Chart = {
  bpm: 120,
  bars: 2,
  lanes: 4,
  notes: [
    { step: 0, lane: 0, dur: 4 },
    { step: 4, lane: 1, dur: 4 },
    { step: 16, lane: 0, dur: 4 },
  ],
  backing: [
    { step: -16, kind: 'drum', slot: 2, vel: 0.6 },
    { step: 0, kind: 'drum', slot: 0, vel: 0.9 },
    { step: 0, kind: 'bass', degree: 0, dur: 2, vel: 0.7 },
    { step: 4, kind: 'drum', slot: 1, vel: 0.7 },
  ],
};
// 120 BPM: semicolcheia de 0,125 s; o compasso de entrada começa em t0 = 10 (passo 32 do relógio)
const timing = { startStep: 32, t0: 10, stepDur: 0.125, lag: 0.1, lead: 2 };
const make = () => {
  const played: { ev: BackingEvent; when: number }[] = [];
  const run = new GameRun(chart, { playBacking: (ev, when) => played.push({ ev, when }) }, timing);
  return { run, played };
};

describe('GameRun', () => {
  it('tempos das notas depois do compasso de entrada', () => {
    const { run } = make();
    expect(run.start).toBe(12);
    expect(run.times).toEqual([12, 12.5, 14]);
    // 2 compassos + cauda + atraso
    expect(run.end).toBeCloseTo(12 + 4 + 0.6 + 0.1);
  });

  it('agenda o acompanhamento de cada passo uma só vez', () => {
    const { run, played } = make();
    run.onStep(31, 9.875);
    run.onStep(32, 10);
    run.onStep(48, 12);
    run.onStep(48, 12);
    run.onStep(52, 12.5);
    expect(played.map((p) => [p.ev.step, p.when])).toEqual([
      [-16, 10],
      [0, 12],
      [0, 12],
      [4, 12.5],
    ]);
  });

  it('desconta o atraso nos toques; o teclado passa 0', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.judgement).toBe('perfect');
    const r = run.press(1, 12.5, 0);
    expect(r).toMatchObject({ judgement: 'perfect', lane: 1, note: chart.notes[1] });
    expect(run.score.perfect).toBe(2);
    expect(run.hitAt[1]).toBe(12.5);
    expect(run.last).toEqual({ kind: 'perfect', at: 12.5 });
  });

  it('contagem, falhados e fim da ronda', () => {
    const { run } = make();
    expect(run.update(11)).toBe(false);
    expect(run.state).toBe('countdown');
    run.press(0, 12.1);
    expect(run.update(13)).toBe(false);
    expect(run.state).toBe('playing');
    expect(run.score.miss).toBe(1);
    expect(run.last?.kind).toBe('miss');
    expect(run.update(16.6)).toBe(false);
    expect(run.update(16.71)).toBe(true);
    expect(run.state).toBe('over');
    expect(run.update(17)).toBe(false);
    expect(run.press(0, 17)).toBeNull();
    expect(run.result(true)).toMatchObject({ perfect: 1, miss: 2, total: 3, best: true });
  });
});

describe('gameStartBar', () => {
  it('escolhe um compasso que o relógio ainda não agendou', () => {
    const seen: number[] = [];
    const clock = {
      lookahead: 0.1,
      nextBarTime: (t: number) => {
        seen.push(t);
        return { time: 2, step: 16 };
      },
    };
    expect(gameStartBar(clock, 1)).toEqual({ time: 2, step: 16 });
    expect(seen[0]).toBeCloseTo(1.15);
  });
});
