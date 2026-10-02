import { describe, expect, it } from 'vitest';
import { NEIGHBOUR_GRACE_S } from './config';
import { changedLagMs, gameStartBar, GameRun } from './run';
import type { BackingEvent, Chart } from './types';

// 4 faixas, split 2: 0 e 1 são da mão esquerda, 2 e 3 da direita
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
  swing: 0,
  split: 2,
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

// 8 faixas, uma nota em cada, a 0,5 s umas das outras; split 4 (0-3 esquerda, 4-7 direita)
const new8 = (lag = 0) => {
  const c: Chart = {
    ...chart,
    lanes: 8,
    notes: Array.from({ length: 8 }, (_, k) => ({ step: k * 4, lane: k, dur: 4 })),
    split: 4,
  };
  return { run: new GameRun(c, { playBacking: () => {} }, { ...timing, lag }) };
};
// uma só nota (faixa 0, t = 12 s): as outras faixas nunca têm nota por perto, para testar o
// toque errado e a tolerância do vizinho sem interferência de outras notas da partitura
const makeOneNote = (split: number) => {
  const c: Chart = { ...chart, notes: [{ step: 0, lane: 0, dur: 4 }], split };
  return new GameRun(c, { playBacking: () => {} }, timing);
};
// uma faixa com notas a cada tempo (0,5 s a 120 BPM)
const makeLane = (lag: number) => {
  const c: Chart = {
    ...chart,
    lanes: 1,
    notes: Array.from({ length: 8 }, (_, k) => ({ step: k * 4, lane: 0, dur: 4 })),
    split: 0,
  };
  return { run: new GameRun(c, { playBacking: () => {} }, { ...timing, lag }) };
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
    expect(run.press(0, 12.4)).toEqual({
      kind: 'late',
      index: 0,
      offset: expect.closeTo(0.3, 5),
      lane: 0,
    });
    expect(run.score.points).toBe(0);
    expect(run.judge.state[0]).toBe(0);
    expect(run.last).toEqual({ kind: 'late', at: 12.4 });
  });

  it('"Tarde" da câmara conta como dobra vista tarde (o do teclado não)', () => {
    const { run } = make();
    run.press(0, 12.4);
    run.press(0, 12.4);
    run.press(0, 12.3, false);
    expect(run.score.lateTaps).toBe(2);
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
      startLagMs: 100,
      lagMs: null,
    });
  });

  it('com 8 toques da câmara, o resultado traz o atraso aprendido', () => {
    // 8 notas diferentes, cada uma 0,3 s cedo (sem atraso): são sempre "Cedo" e o atraso desce
    // até ao mínimo
    const { run } = new8();
    for (let k = 0; k < 8; k++) expect(run.press(k, 12 + k * 0.5 - 0.3)?.kind).toBe('early');
    expect(run.cameraHits).toBe(8);
    expect(run.result(false).lagMs).toBe(0);
    expect(run.result(false).lagMs).toBe(Math.round((run.lag * 1000) / 10) * 10);
  });

  it('Cedo/Tarde repetidos na mesma nota só ensinam o atraso uma vez', () => {
    const { run } = make(0.1);
    // 0,3 tarde da nota 0 (12 s), três vezes: o texto aparece sempre, o atraso sobe só uma vez
    for (let k = 0; k < 3; k++) {
      expect(run.press(0, 12.4)?.kind).toBe('late');
      expect(run.last).toEqual({ kind: 'late', at: 12.4 });
    }
    expect(run.lag).toBeCloseTo(0.1 + 0.15 * 0.3);
    expect(run.cameraHits).toBe(1);
    // um acerto da mesma nota continua a ensinar
    expect(run.press(0, 12.15)?.kind).toBe('perfect');
    expect(run.cameraHits).toBe(2);
  });

  it('um toque tardio depois do sweep diz "Tarde!" e o atraso sobe', () => {
    const { run } = make(0.1);
    // 0,3 tarde da nota 0 (já descontado o atraso): o fotograma de 12,35 já a deu como falhada
    expect(run.update(12.35)).toBe(false);
    expect(run.score.miss).toBe(1);
    expect(run.press(0, 12.4)).toMatchObject({ kind: 'late', index: 0, lane: 0 });
    expect(run.lag).toBeCloseTo(0.1 + 0.15 * 0.3);
    expect(run.score.miss).toBe(1);
    expect(run.cameraHits).toBe(1);
  });

  it('notas a 1 tempo na mesma faixa (como no Difícil): um Tarde não gasta a nota seguinte', () => {
    const { run } = makeLane(0.125);
    // nota 0 em 12 s, nota 1 em 12,5 s; o toque fica 0,25 tarde da 0 (12,375 − 0,125)
    run.update(12.375);
    expect(run.judge.state[0]).toBe(3);
    expect(run.press(0, 12.375)).toMatchObject({ kind: 'late', index: 0 });
    expect(run.judge.state[1]).toBe(0);
    expect(run.lag).toBeGreaterThan(0.125);
    expect(run.lag).toBeCloseTo(0.125 + 0.15 * 0.25);
    // a nota seguinte continua por julgar e acerta-se no tempo dela
    expect(run.press(0, 12.5 + run.lag)?.kind).toBe('perfect');
  });

  it('o resultado traz o atraso de partida; só se mostra o aprendido quando mudou', () => {
    const { run } = make(0.12);
    expect(run.result(false).startLagMs).toBe(120);
    expect(changedLagMs({ startLagMs: 120, lagMs: null })).toBeNull();
    expect(changedLagMs({ startLagMs: 120, lagMs: 120 })).toBeNull();
    expect(changedLagMs({ startLagMs: 120, lagMs: 150 })).toBe(150);
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

  it('pausar outra vez dentro da contagem do retomar mantém o mesmo ponto de retoma', () => {
    const { run, played } = make();
    run.onStep(48, 12);
    run.pause(12.2);
    // o próximo passo por ouvir era o 2; o primeiro retomar desloca tudo para o compasso 80 (16 s)
    run.resume(80, 16);
    // pausa outra vez ainda dentro da contagem deste retomar (antes de countTo, 18 s): o passo
    // por ouvir continua a ser o 2 — não se recalcula a partir de `start`, ou "recuaria"
    run.pause(17.3);
    played.length = 0;
    // segundo retomar, agora para o compasso 160 (24 s)
    run.resume(160, 24);
    expect(run.state).toBe('countdown');
    expect(run.countTo).toBe(26);
    // o mesmo passo 2 desta vez cai em 25,75 s: tudo desloca 25,75 − 17,75 = 8 s
    expect(run.times).toEqual([25.75, 26.25, 27.75]);
    expect(run.start).toBeCloseTo(25.75);
    run.onStep(176, 25.75);
    run.onStep(177, 26);
    run.onStep(178, 26.25);
    run.onStep(179, 26.5);
    // só o passo 4 (ainda por ouvir) toca; os passos 0 (já tocados antes da primeira pausa) não
    // voltam a soar
    expect(played.map((p) => [p.ev.kind, p.ev.kind === 'drum' ? p.ev.slot : -1, p.when])).toEqual([
      ['drum', 1, 26.25],
    ]);
    expect(run.update(26.1)).toBe(false);
    expect(run.state).toBe('playing');
  });

  it('isAtEnd: só em pausa e com a partitura toda já ouvida (a cauda)', () => {
    // a partitura acaba em 12 + 2 × 16 × 0,125 = 16 s; o último passo (31) começa em 15,875 s
    const mid = make().run;
    expect(mid.isAtEnd()).toBe(false);
    mid.pause(15.8);
    expect(mid.isAtEnd()).toBe(false);
    const tail = make().run;
    tail.pause(16.2);
    expect(tail.isAtEnd()).toBe(true);
    const countIn = make().run;
    countIn.pause(11);
    expect(countIn.isAtEnd()).toBe(false);
  });

  it('finishNow: acaba a ronda e dá as notas por julgar como falhadas', () => {
    const { run } = make();
    run.press(0, 12.1);
    run.pause(16.2);
    run.finishNow(16.2);
    expect(run.state).toBe('over');
    expect(run.score.miss).toBe(2);
    expect(run.judge.done).toBe(true);
    expect(run.viewNow(17)).toBe(17);
  });

  it('pausar durante a entrada recomeça do compasso 1', () => {
    const { run } = make();
    run.pause(11);
    run.resume(80, 16);
    expect(run.times[0]).toBe(18);
  });
});

describe('GameRun.isMusicTime', () => {
  it('falso antes de countTo, verdadeiro durante, falso depois da última nota + NEAR_S', () => {
    const { run } = make();
    expect(run.isMusicTime(11)).toBe(false);
    run.update(12.5);
    expect(run.isMusicTime(12.5)).toBe(true);
    run.update(14.4);
    // última nota em 14 s; 14 + 0,35 = 14,35
    expect(run.isMusicTime(14.4)).toBe(false);
  });

  it('falso em pausa', () => {
    const { run } = make();
    run.update(12.5);
    run.pause(12.5);
    expect(run.isMusicTime(12.5)).toBe(false);
  });

  it('falso depois de uma retoma, durante a nova contagem', () => {
    const { run } = make();
    run.pause(12.2);
    run.resume(80, 16);
    expect(run.state).toBe('countdown');
    expect(run.isMusicTime(17)).toBe(false);
  });
});

describe('GameRun.press: toques errados', () => {
  it('um toque solto fora da música não conta como erro', () => {
    const { run } = make();
    expect(run.press(2, 11)).toBeNull();
    expect(run.score.wrongTaps).toBe(0);
  });

  it('um toque solto durante a música, sem nota por perto, conta como erro e parte o combo', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    expect(run.press(3, 12.2)).toEqual({ kind: 'wrong', lane: 3 });
    expect(run.score.wrongTaps).toBe(1);
    expect(run.score.combo).toBe(0);
    expect(run.last).toEqual({ kind: 'wrong', at: 12.2 });
  });

  it('tolerância: um vizinho da mesma mão dentro de 0,15 s não conta como erro', () => {
    const run = makeOneNote(2); // split 2: faixas 0 e 1 da mesma mão
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.press(1, 12.2)).toBeNull(); // 0,1 s depois, dentro de NEIGHBOUR_GRACE_S (0,15)
    expect(run.score.wrongTaps).toBe(0);
  });

  it('a 0,2 s (além de NEIGHBOUR_GRACE_S) o mesmo vizinho já conta como erro', () => {
    const run = makeOneNote(2);
    run.press(0, 12.1);
    expect(NEIGHBOUR_GRACE_S).toBeLessThan(0.2);
    expect(run.press(1, 12.3)).toEqual({ kind: 'wrong', lane: 1 });
    expect(run.score.wrongTaps).toBe(1);
  });

  it('um vizinho de mão diferente conta como erro mesmo dentro da janela', () => {
    const run = makeOneNote(1); // split 1: a faixa 0 fica sozinha de um lado, a 1 já é da outra mão
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.press(1, 12.1 + 0.05)).toEqual({ kind: 'wrong', lane: 1 });
    expect(run.score.wrongTaps).toBe(1);
  });

  it('a 2 faixas de distância conta como erro mesmo na mesma mão e dentro da janela', () => {
    const run = makeOneNote(3); // split 3: faixas 0, 1 e 2 são todas da mesma mão
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.press(2, 12.1 + 0.05)).toEqual({ kind: 'wrong', lane: 2 });
    expect(run.score.wrongTaps).toBe(1);
  });

  it('Cedo/Tarde partem o combo mas não contam como erro', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    expect(run.press(0, 14.4)?.kind).toBe('late');
    expect(run.score.combo).toBe(0);
    expect(run.score.wrongTaps).toBe(0);
  });
});

// Chart com swing: notas nos passos 0 e 2 (2 cai no contratempo, `((s % 4) + 4) % 4 === 2`) e
// um evento de acompanhamento também no passo 2.
const swingChart: Chart = {
  bpm: 120,
  bars: 2,
  lanes: 4,
  notes: [
    { step: 0, lane: 0, dur: 4 },
    { step: 2, lane: 1, dur: 2 },
  ],
  backing: [{ step: 2, kind: 'drum', slot: 2, vel: 0.5 }],
  swing: 0.6,
  split: 2,
};
const makeSwing = () => {
  const played: { ev: BackingEvent; when: number }[] = [];
  const run = new GameRun(
    swingChart,
    { playBacking: (ev, when) => played.push({ ev, when }) },
    { ...timing },
  );
  return { run, played };
};

describe('GameRun com swing', () => {
  it('os tempos das notas levam o atraso do swing na colcheia em contratempo (passo 2)', () => {
    const { run } = makeSwing();
    const { stepDur } = timing;
    expect(run.times).toEqual([run.start, run.start + (2 + 0.6) * stepDur]);
  });

  it('um evento de acompanhamento no contratempo toca com o mesmo atraso do swing', () => {
    const { run, played } = makeSwing();
    // passo 2 do relógio (absStep 50), no tempo direito (sem swing) que o relógio lhe dá
    run.onStep(50, 12.25);
    expect(played).toEqual([{ ev: swingChart.backing[0], when: 12.25 + 0.6 * timing.stepDur }]);
  });

  it('a pausa e a retoma mantêm o swing (a mesma distância entre os tempos)', () => {
    const { run } = makeSwing();
    const gapBefore = run.times[1] - run.times[0];
    run.pause(12.2);
    run.resume(80, 16);
    expect(run.times[1] - run.times[0]).toBeCloseTo(gapBefore);
    // e `timeOf` continua certo depois da retoma, com o novo `start`
    expect(run.timeOf(2)).toBeCloseTo(run.times[1]);
  });

  it('a pausa conta o swing: um passo em contratempo ainda por ouvir não cai dentro da contagem da retoma', () => {
    const { run } = makeSwing();
    const { stepDur } = timing;
    // entre o passo 1 (a 1×stepDur de `start`) e o passo 2, que só soa aos 2,6×stepDur por
    // causa do swing: uma divisão direta por `stepDur` (sem o swing) arredondava para cima e
    // dava o passo 2 como já ouvido (pRel 3), antes deste soar de facto
    run.pause(run.start + 2.3 * stepDur);
    run.resume(999, 50);
    // o passo 2 (a nota em `times[1]`) cai depois da contagem da retoma, nunca dentro dela
    expect(run.times[1]).toBeGreaterThanOrEqual(run.countTo);
    expect(run.times[1]).toBeCloseTo(run.countTo + 0.6 * stepDur);
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
