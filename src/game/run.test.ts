import { describe, expect, it } from 'vitest';
import { ENERGY_GOOD, ENERGY_PERFECT, NEIGHBOUR_GRACE_S, POWER_S } from './config';
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
    expect(run.result()).toMatchObject({
      perfect: 1,
      miss: 2,
      total: 3,
      startLagMs: 100,
      lagMs: null,
    });
  });

  it('com 8 toques da câmara, o resultado traz o atraso aprendido', () => {
    // 8 notas diferentes: a primeira certa (um Cedo antes dela cairia na entrada, que não é
    // música) e as outras 0,3 s cedo (sem atraso): são sempre "Cedo" e o atraso desce até ao mínimo
    const { run } = new8();
    expect(run.press(0, 12)?.kind).toBe('perfect');
    for (let k = 1; k < 8; k++) expect(run.press(k, 12 + k * 0.5 - 0.3)?.kind).toBe('early');
    expect(run.cameraHits).toBe(8);
    expect(run.result().lagMs).toBe(0);
    expect(run.result().lagMs).toBe(Math.round((run.lag * 1000) / 10) * 10);
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
    expect(run.result().startLagMs).toBe(120);
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
  it('um toque solto fora da música não conta como erro nem soa', () => {
    const { run } = make();
    expect(run.press(2, 11)).toBeNull();
    run.update(11.5);
    expect(run.score.wrongTaps).toBe(0);
  });

  it('um toque solto durante a música, sem nota por perto, conta como erro depois da janela e parte o combo', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    // soa logo (stray), mas só conta quando passa NEIGHBOUR_GRACE_S sem acerto vizinho
    expect(run.press(3, 12.2)).toEqual({ kind: 'stray', lane: 3 });
    run.update(12.3);
    expect(run.score.wrongTaps).toBe(0);
    run.update(12.4);
    expect(run.score.wrongTaps).toBe(1);
    expect(run.score.combo).toBe(0);
    expect(run.last).toEqual({ kind: 'wrong', at: 12.4 });
  });

  it('tolerância: um vizinho da mesma mão dentro de 0,15 s depois de um acerto não conta como erro', () => {
    const run = makeOneNote(2); // split 2: faixas 0 e 1 da mesma mão
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.press(1, 12.2)?.kind).toBe('stray'); // 0,1 s depois, dentro de NEIGHBOUR_GRACE_S
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(0);
  });

  it('tolerância: o vizinho primeiro (10 ms antes) e depois o acerto não conta como erro', () => {
    const run = makeOneNote(2);
    expect(run.press(1, 12.09)?.kind).toBe('stray');
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(0);
    expect(run.score.combo).toBe(1);
  });

  it('o vizinho primeiro sem acerto nos 0,15 s seguintes conta como erro depois do update', () => {
    const run = makeOneNote(2);
    expect(run.press(1, 12.25)?.kind).toBe('stray');
    expect(run.score.wrongTaps).toBe(0);
    run.update(12.35);
    expect(run.score.wrongTaps).toBe(0);
    run.update(12.45);
    expect(run.score.wrongTaps).toBe(1);
  });

  it('a 0,2 s (além de NEIGHBOUR_GRACE_S) o mesmo vizinho já conta como erro', () => {
    const run = makeOneNote(2);
    run.press(0, 12.1);
    expect(NEIGHBOUR_GRACE_S).toBeLessThan(0.2);
    expect(run.press(1, 12.3)?.kind).toBe('stray');
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(1);
  });

  it('tolerância: um segundo disparo da mesma faixa dentro de 0,15 s não conta como erro', () => {
    const run = makeOneNote(2);
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    // a câmara "ressalta" (histerese/disparo duplo) e deteta outra vez a mesma faixa
    run.press(0, 12.2); // 0,1 s depois, dentro de NEIGHBOUR_GRACE_S (0,15)
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(0);
  });

  it('a 0,2 s (além de NEIGHBOUR_GRACE_S) o mesmo disparo repetido já conta como erro', () => {
    const run = makeOneNote(2);
    run.press(0, 12.1);
    run.press(0, 12.3);
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(1);
  });

  it('um toque solto julgado depois de um acerto mais recente não lhe parte o combo nem tapa o último juízo (carregado da v5)', () => {
    const { run } = make();
    // o toque solto fica pendente (faixa 3, longe de qualquer nota)
    expect(run.press(3, 12.05)).toEqual({ kind: 'stray', lane: 3 });
    // um acerto depois dele começa o combo e torna-se o último juízo
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    // a janela do toque solto (0,15 s) já passou quando o `update` o julga: conta como erro, mas
    // em ordem de tempo não pode desfazer o que o acerto mais recente já construiu
    run.update(12.05 + NEIGHBOUR_GRACE_S + 0.01);
    expect(run.score.wrongTaps).toBe(1);
    expect(run.score.combo).toBe(1);
    expect(run.last).toEqual({ kind: 'perfect', at: 12.1 });
  });

  it('um toque solto julgado antes de qualquer acerto continua a partir o combo e a mostrar "Errado" (comportamento de sempre)', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    expect(run.press(3, 12.2)).toEqual({ kind: 'stray', lane: 3 });
    run.update(12.2 + NEIGHBOUR_GRACE_S + 0.01);
    expect(run.score.wrongTaps).toBe(1);
    expect(run.score.combo).toBe(0);
    expect(run.last?.kind).toBe('wrong');
  });

  it('um combo construído antes do toque solto não sobrevive ao flush: só os acertos depois dele continuam a contar', () => {
    // 6 faixas, split 3 (0–2 esquerda, 3–5 direita): a faixa 5 não é vizinha de nenhuma das notas
    const c: Chart = {
      ...chart,
      lanes: 6,
      notes: [
        { step: 0, lane: 0, dur: 4 }, // 12 s
        { step: 4, lane: 1, dur: 4 }, // 12,5 s
        { step: 8, lane: 2, dur: 4 }, // 13 s
        { step: 10, lane: 3, dur: 4 }, // 13,25 s
      ],
      split: 3,
    };
    const run = new GameRun(c, { playBacking: () => {} }, { ...timing, lag: 0 });
    // 3 acertos seguidos constroem o combo a 3
    expect(run.press(0, 12)?.kind).toBe('perfect');
    expect(run.press(1, 12.5)?.kind).toBe('perfect');
    expect(run.press(2, 13)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(3);
    // um toque solto na faixa 5 (longe de qualquer acerto) fica pendente a partir daqui
    expect(run.press(5, 13.2)).toEqual({ kind: 'stray', lane: 5 });
    // 0,05 s depois, mais um acerto: o combo sobe para 4 antes de a janela do toque solto passar
    expect(run.press(3, 13.25)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(4);
    // quando a janela passa, o toque solto parte o combo no seu próprio instante: só o acerto
    // que veio a seguir a ele (1, não os 3 de antes) continua a contar
    run.update(13.2 + NEIGHBOUR_GRACE_S + 0.01);
    expect(run.score.wrongTaps).toBe(1);
    expect(run.score.combo).toBe(1);
    expect(run.score.maxCombo).toBe(4); // o que se viu no ecrã nesse instante não se desfaz
  });

  it('um vizinho de mão diferente conta como erro mesmo dentro da janela (antes ou depois)', () => {
    const run = makeOneNote(1); // split 1: a faixa 0 fica sozinha de um lado, a 1 já é da outra mão
    run.press(1, 12.1 - 0.01);
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    run.press(1, 12.1 + 0.05);
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(2);
  });

  it('a 2 faixas de distância conta como erro mesmo na mesma mão e dentro da janela (antes ou depois)', () => {
    const run = makeOneNote(3); // split 3: faixas 0, 1 e 2 são todas da mesma mão
    run.press(2, 12.1 - 0.01);
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    run.press(2, 12.1 + 0.05);
    run.update(12.6);
    expect(run.score.wrongTaps).toBe(2);
  });

  it('a tolerância é por faixa: um acerto da outra mão não apaga o de uma faixa vizinha', () => {
    // faixa 0 em 12 s (esquerda) e faixa 4 em 12,5 s (direita)
    const { run } = new8();
    expect(run.press(0, 12)?.kind).toBe('perfect');
    expect(run.press(1, 12.5)?.kind).toBe('perfect');
    // 0,1 s depois do acerto na faixa 0 seria perdoado; aqui 0,6 s depois, mesmo havendo um
    // acerto mais recente noutra faixa (a 1, também vizinha): este vem do acerto da faixa 1
    run.press(2, 12.55);
    // a faixa 5 (outra mão) só tem acertos longe: conta
    run.press(5, 12.55);
    run.update(12.8);
    expect(run.score.wrongTaps).toBe(1);
  });

  it('Cedo/Tarde partem o combo; o primeiro na mesma nota não conta como erro', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.combo).toBe(1);
    expect(run.press(0, 14.4)?.kind).toBe('late');
    expect(run.score.combo).toBe(0);
    expect(run.score.wrongTaps).toBe(0);
  });

  it('insistir: o segundo Cedo/Tarde e os seguintes na mesma nota contam como toques errados', () => {
    const { run } = make();
    // nota da faixa 1 em 12,5 s; lag 0,1: toque em 12,3 é julgado em 12,2 (−0,3: Cedo)
    expect(run.press(1, 12.3)?.kind).toBe('early');
    expect(run.score.wrongTaps).toBe(0);
    expect(run.press(1, 12.31)?.kind).toBe('early');
    expect(run.press(1, 12.32)?.kind).toBe('early');
    expect(run.score.wrongTaps).toBe(2);
    // a nota continua por julgar: um acerto a seguir conta
    expect(run.press(1, 12.6)?.kind).toBe('perfect');
  });
});

describe('GameRun.press: o juiz decide o que é música', () => {
  it('última nota com atraso de 0,25 s: um Bom a +0,12 s conta e soa, já depois de isMusicTime(now)', () => {
    const { run } = make(0.25);
    run.update(13);
    const now = 14 + 0.25 + 0.12; // última nota em 14 s
    expect(run.isMusicTime(now)).toBe(false);
    run.update(now);
    const r = run.press(0, now);
    expect(r?.kind).toBe('good');
    expect(run.score.good).toBe(1);
    run.update(now + 0.1);
    expect(run.score.miss).toBe(2); // só as duas primeiras, que ficaram por tocar
  });

  it('depois de uma retoma, uma nota em countTo apanha um toque do teclado 0,15 s cedo', () => {
    const { run } = make();
    run.press(0, 12.1);
    run.pause(12.5); // a nota da faixa 1 (12,5 s) fica a ser o primeiro passo por ouvir
    run.resume(80, 16);
    expect(run.times[1]).toBeCloseTo(run.countTo);
    run.update(run.countTo - 0.15);
    expect(run.state).toBe('countdown');
    expect(run.press(1, run.countTo - 0.15, false)?.kind).toBe('good');
    expect(run.score.good).toBe(1);
  });

  it('um Cedo na contagem (antes da música) não soa nem conta', () => {
    const { run } = make();
    expect(run.press(0, 11.7, false)).toBeNull(); // 0,3 s antes da primeira nota, na entrada
    expect(run.score.combo).toBe(0);
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

describe('GameRun: energia (Star Power)', () => {
  it('a energia sobe com Perfeitos e Bons; um toque errado não lhe mexe', () => {
    const { run } = make();
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.energy).toBeCloseTo(ENERGY_PERFECT);
    // nota 1 (faixa 1, 12,5 s), 0,15 s tarde (depois de descontar o atraso de 0,1): Bom
    expect(run.press(1, 12.75)?.kind).toBe('good');
    expect(run.energy).toBeCloseTo(ENERGY_PERFECT + ENERGY_GOOD);
    // toque solto, sem vizinho a perdoá-lo: conta como erro depois da janela, mas não dá energia
    run.press(3, 12.9);
    run.update(12.9 + NEIGHBOUR_GRACE_S + 0.01);
    expect(run.score.wrongTaps).toBe(1);
    expect(run.energy).toBeCloseTo(ENERGY_PERFECT + ENERGY_GOOD);
  });

  it('a energia não sobe durante a própria energia ativa, e fica limitada a 1', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.activatePower(12.1)).toBe(true); // esvazia a barra
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.energy).toBe(0); // continuou a 0: o acerto foi durante a energia ativa
  });

  it('canActivate só com a barra cheia, fora da energia ativa e durante a música', () => {
    const { run } = make();
    expect(run.canActivate(12.1)).toBe(false); // barra vazia
    run.energy = 1;
    expect(run.canActivate(11)).toBe(false); // ainda na contagem (antes de countTo), não é música
    expect(run.canActivate(12.1)).toBe(true);
    expect(run.activatePower(12.1)).toBe(true);
    expect(run.canActivate(12.1)).toBe(false); // a energia já está ativa
  });

  it('activatePower falha sem a barra cheia ou fora da música, e não gasta a barra nesse caso', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.activatePower(11)).toBe(false); // na contagem, não é música
    expect(run.energy).toBe(1);
    expect(run.powerUses).toBe(0);
  });

  it('um acerto durante a energia ativa dá o dobro dos pontos (com o multiplicador do combo)', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.activatePower(12.1)).toBe(true);
    expect(run.press(0, 12.1)?.kind).toBe('perfect');
    expect(run.score.points).toBe(200); // 100 × ×1 do combo × 2 da energia
  });

  it('a energia ativa acaba ao fim de POWER_S, e powerLeft desce de 1 a 0', () => {
    const { run } = make();
    run.energy = 1;
    run.activatePower(12.1); // powerUntil = 12,1 + POWER_S
    expect(POWER_S).toBe(8);
    expect(run.powerActive(12.1)).toBe(true);
    expect(run.powerLeft(12.1)).toBeCloseTo(1);
    expect(run.powerLeft(12.1 + POWER_S / 2)).toBeCloseTo(0.5);
    expect(run.powerActive(12.1 + POWER_S - 0.001)).toBe(true);
    expect(run.powerActive(12.1 + POWER_S)).toBe(false);
    expect(run.powerLeft(12.1 + POWER_S)).toBe(0);
  });

  it('powerActive é falso quando a ronda já acabou, mesmo dentro dos 8 s', () => {
    const { run } = make();
    run.energy = 1;
    run.activatePower(12.1);
    run.update(16.8);
    expect(run.update(16.91)).toBe(true); // a ronda acaba (como no teste de fim de ronda acima)
    expect(run.state).toBe('over');
    expect(run.powerActive(12.1)).toBe(false);
  });

  it('a pausa congela a energia ativa; a retoma desloca `powerUntil` pelo mesmo dt dos tempos', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.activatePower(12.1)).toBe(true); // powerUntil = 12,1 + POWER_S
    run.update(12.2);
    run.pause(12.2);
    expect(run.powerUntil).toBe(12.1 + POWER_S); // não se mexe durante a pausa
    const timeBefore = run.times[0];
    run.resume(80, 16);
    const dt = run.times[0] - timeBefore; // o mesmo deslocamento que `hitAt`/`judgedAt` levam
    expect(run.powerUntil).toBeCloseTo(12.1 + POWER_S + dt);
    // o tempo restante (até powerUntil) mantém-se: continua ativa logo a seguir à retoma
    expect(run.powerActive(run.times[0])).toBe(true);
  });

  it('powerUntil não se desloca na retoma se a energia nunca foi ativada', () => {
    const { run } = make();
    run.pause(12.2);
    run.resume(80, 16);
    expect(run.powerUntil).toBe(-Infinity);
  });

  it('powerUses conta as ativações, e aparece no resultado', () => {
    const { run } = make();
    expect(run.powerUses).toBe(0);
    expect(run.activatePower(12.1)).toBe(false); // barra vazia
    expect(run.powerUses).toBe(0);
    run.energy = 1;
    expect(run.activatePower(12.1)).toBe(true);
    expect(run.powerUses).toBe(1);
    expect(run.result().powerUses).toBe(1);
  });
});

describe('GameRun: tryActivatePower (borda de subida da boca)', () => {
  it('ativa com a boca aberta, armada e a barra cheia', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.tryActivatePower(true, 12.1)).toBe(true);
    expect(run.powerUses).toBe(1);
  });

  it('já aberta quando a barra enche (nunca fechou entretanto): não ativa', () => {
    const { run } = make();
    // a boca já estava aberta antes de a barra encher (desarma logo no 1.º fotograma)
    expect(run.tryActivatePower(true, 11)).toBe(false); // na contagem, sem barra: não ativa
    run.energy = 1;
    expect(run.tryActivatePower(true, 12.1)).toBe(false); // continua aberta: não é uma borda nova
    expect(run.powerUses).toBe(0);
  });

  it('fecha e volta a abrir depois de a barra encher: ativa na nova borda', () => {
    const { run } = make();
    run.tryActivatePower(true, 11); // aberta antes da barra encher
    run.energy = 1;
    expect(run.tryActivatePower(true, 12.1)).toBe(false); // ainda a mesma abertura
    expect(run.tryActivatePower(false, 12.1)).toBe(false); // fecha: arma-se
    expect(run.tryActivatePower(true, 12.1)).toBe(true); // reabre: nova borda, ativa
    expect(run.powerUses).toBe(1);
  });

  it('com a boca fechada nunca ativa, e fica sempre armada', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.tryActivatePower(false, 12.1)).toBe(false);
    expect(run.tryActivatePower(false, 12.1)).toBe(false);
    expect(run.powerUses).toBe(0);
  });

  it('depois de ativar, mantém a boca aberta sem voltar a ativar (como activatePower)', () => {
    const { run } = make();
    run.energy = 1;
    expect(run.tryActivatePower(true, 12.1)).toBe(true);
    expect(run.tryActivatePower(true, 12.2)).toBe(false); // ainda aberta: sem nova borda
    run.energy = 1; // mesmo que a barra enchesse de novo (não enche durante a própria energia)
    expect(run.tryActivatePower(true, 12.3)).toBe(false); // continua desarmada
    expect(run.powerUses).toBe(1);
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
