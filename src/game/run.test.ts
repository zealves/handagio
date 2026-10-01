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
const make = (lag = 0.1) => {
  const played: { ev: BackingEvent; when: number }[] = [];
  const run = new GameRun(
    chart,
    { playBacking: (ev, when) => played.push({ ev, when }) },
    { ...timing, lag },
  );
  return { run, played };
};

describe('GameRun', () => {
  it('tempos das notas depois do compasso de entrada; o fim espera pelo atraso máximo', () => {
    const { run } = make();
    expect(run.start).toBe(12);
    expect(run.countTo).toBe(12);
    expect(run.times).toEqual([12, 12.5, 14]);
    expect(run.end).toBeCloseTo(12 + 4 + 0.6 + 0.3);
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

  it('a câmara desconta o atraso e ensina-o; o teclado não', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.lag).toBeCloseTo(0.1);
    expect(run.cameraHits).toBe(1);
    expect(run.press(1, 12.5, false)).toMatchObject({
      kind: 'perfect',
      lane: 1,
      note: chart.notes[1],
    });
    expect(run.cameraHits).toBe(1);
    expect(run.lag).toBeCloseTo(0.1);
    expect(run.hitAt[1]).toBe(12.5);
  });

  it('o atraso aprendido segue os desvios e fica dentro dos limites', () => {
    const late = make().run;
    // 0,15 tarde (depois de descontar 0,1): sobe 0,15 × 0,15
    expect(late.press(0, 12.25)?.kind).toBe('good');
    expect(late.lag).toBeCloseTo(0.1225);
    const early = make().run;
    early.press(0, 11.95);
    expect(early.lag).toBeCloseTo(0.1 - 0.15 * 0.15);
    const top = make(0.29).run;
    top.press(0, 12.49);
    expect(top.lag).toBeCloseTo(0.3);
    const bottom = make(0.01).run;
    bottom.press(0, 11.81);
    expect(bottom.lag).toBe(0);
  });

  it('Cedo/Tarde: sem pontos, sem gastar a nota, com o último juízo', () => {
    const { run } = make();
    expect(run.press(0, 12.4)).toEqual({ kind: 'late', offset: expect.closeTo(0.3, 5), lane: 0 });
    expect(run.score.points).toBe(0);
    expect(run.judge.state[0]).toBe(0);
    expect(run.last).toEqual({ kind: 'late', at: 12.4 });
  });

  it('contagem, falhados e fim da ronda', () => {
    const { run } = make();
    expect(run.update(11)).toBe(false);
    expect(run.state).toBe('countdown');
    run.press(0, 12.1);
    expect(run.update(13)).toBe(false);
    expect(run.state).toBe('playing');
    expect(run.score.miss).toBe(1);
    expect(run.update(16.8)).toBe(false);
    expect(run.update(16.91)).toBe(true);
    expect(run.state).toBe('over');
    expect(run.press(0, 17)).toBeNull();
    expect(run.result(true)).toMatchObject({
      perfect: 1,
      miss: 2,
      total: 3,
      best: true,
      lagMs: null,
    });
  });

  it('com 8 toques da câmara, o resultado traz o atraso aprendido', () => {
    // sem atraso, 0,3 cedo: é sempre "Cedo" (não gasta a nota) e o atraso fica no mínimo
    const { run } = make(0);
    for (let k = 0; k < 8; k++) expect(run.press(0, 11.7)?.kind).toBe('early');
    expect(run.cameraHits).toBe(8);
    expect(run.result(false).lagMs).toBe(0);
    expect(run.result(false).lagMs).toBe(Math.round((run.lag * 1000) / 10) * 10);
  });

  it('pausa: congela a vista, os toques e os falhados', () => {
    const { run } = make();
    run.update(12.2);
    run.pause(12.2);
    expect(run.state).toBe('paused');
    expect(run.viewNow(15)).toBe(12.2);
    expect(run.press(0, 12.2)).toBeNull();
    expect(run.update(14)).toBe(false);
    expect(run.score.miss).toBe(0);
    expect(run.judge.state[0]).toBe(0);
  });

  it('retoma: desloca a ronda por passos, conta um compasso e continua o acompanhamento', () => {
    const { run, played } = make();
    run.onStep(48, 12);
    played.length = 0;
    run.pause(12.2);
    // o próximo passo por ouvir era o 2 (12,25); o compasso de retoma começa no passo 80 (16 s)
    run.resume(80, 16);
    expect(run.state).toBe('countdown');
    expect(run.countTo).toBe(18);
    // o passo 2 cai em 18 s: tudo desloca 18 − 12,25 = 5,75 s
    expect(run.times).toEqual([17.75, 18.25, 19.75]);
    expect(run.start).toBeCloseTo(17.75);
    expect(run.viewNow(16.5)).toBe(16.5);
    run.onStep(79, 15.875);
    run.onStep(80, 16);
    run.onStep(82, 16.25);
    run.onStep(84, 16.5);
    run.onStep(96, 18);
    run.onStep(98, 18.25);
    expect(played.map((p) => [p.ev.kind, p.ev.kind === 'drum' ? p.ev.slot : -1, p.when])).toEqual([
      ['drum', 2, 16],
      ['drum', 2, 16.5],
      ['drum', 1, 18.25],
    ]);
    expect(run.update(18.1)).toBe(false);
    expect(run.state).toBe('playing');
    expect(run.press(1, 18.35)?.kind).toBe('perfect');
  });

  it('pausar durante a entrada recomeça do compasso 1', () => {
    const { run } = make();
    run.pause(11);
    run.resume(80, 16);
    expect(run.times[0]).toBe(18);
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
