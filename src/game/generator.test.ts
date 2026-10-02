import { describe, expect, it } from 'vitest';
import { COUNT_IN_STEPS, DIFFICULTIES, DIFFICULTY, MIN_NOTE_GAP_S } from './config';
import {
  alternateHands,
  crashSlotFor,
  DRUM_SLOT,
  enforceMinGap,
  generateChart,
  minGapSteps,
  mirrorLane,
  progressionFor,
  spaceLanes,
  swungStep,
} from './generator';
import { levelIndex, LEVELS } from './levels';

const seeds = Array.from({ length: 20 }, (_, k) => k + 1);

describe('spaceLanes', () => {
  it('afasta notas seguidas na mesma faixa, mudando para a faixa ao lado', () => {
    const out = spaceLanes(
      [
        { step: 0, lane: 1 },
        { step: 2, lane: 1 },
        { step: 8, lane: 3 },
      ],
      4,
    );
    expect(out[0]).toEqual({ step: 0, lane: 1 });
    expect(out[1].lane).not.toBe(1);
    expect(out[2]).toEqual({ step: 8, lane: 3 });
  });

  it('nunca move a última nota: se colidir com a anterior, é a anterior que muda de faixa', () => {
    // a reassignação do conflito (passo 0 / passo 2, faixa 1) empurraria a nota do passo 2 para
    // a faixa 2, que é a faixa da nota final (passo 4) a menos de 1 tempo de distância
    const out = spaceLanes(
      [
        { step: 0, lane: 1 },
        { step: 2, lane: 1 },
        { step: 4, lane: 2 },
      ],
      4,
    );
    const last = out[out.length - 1];
    expect(last).toEqual({ step: 4, lane: 2 });
    const prev = out[out.length - 2];
    expect(prev.step).toBe(2);
    expect(prev.lane).not.toBe(last.lane);
  });

  it('ao mudar a penúltima nota, evita também a faixa da sua própria antecessora', () => {
    const out = spaceLanes(
      [
        { step: 0, lane: 3 },
        { step: 6, lane: 0 },
        { step: 8, lane: 0 },
      ],
      5,
    );
    const last = out[out.length - 1];
    expect(last).toEqual({ step: 8, lane: 0 });
    const prev = out[out.length - 2];
    expect(prev.step).toBe(6);
    expect(prev.lane).not.toBe(0); // não repete a faixa da nota final
    expect(prev.lane).not.toBe(3); // não repete a faixa da sua antecessora
    expect(prev.lane).toBeGreaterThanOrEqual(0);
    expect(prev.lane).toBeLessThan(5);
  });

  it('spaceLanes com 2 faixas: sem faixa livre para a anterior, a anterior sai', () => {
    // a final (faixa 0) colide com a anterior (faixa 0) e a antes dela está na faixa 1
    const out = spaceLanes(
      [
        { step: 0, lane: 1 },
        { step: 2, lane: 0 },
        { step: 4, lane: 0 },
      ],
      2,
    );
    expect(out).toEqual([
      { step: 0, lane: 1 },
      { step: 4, lane: 0 },
    ]);
  });
});

describe('generateChart', () => {
  it('a mesma semente dá a mesma partitura', () => {
    const a = generateChart({ difficulty: 'medium', seed: 7, scaleSize: 7, lanes: 4 });
    expect(generateChart({ difficulty: 'medium', seed: 7, scaleSize: 7, lanes: 4 })).toEqual(a);
    expect(
      generateChart({ difficulty: 'medium', seed: 8, scaleSize: 7, lanes: 4 }).notes,
    ).not.toEqual(a.notes);
  });

  it('usa o BPM, os compassos e as faixas', () => {
    for (const d of DIFFICULTIES) {
      const c = generateChart({ difficulty: d, seed: 1, scaleSize: 7, lanes: 4 });
      expect(c.bpm).toBe(DIFFICULTY[d].bpm);
      expect(c.bars).toBe(DIFFICULTY[d].bars);
      expect(generateChart({ difficulty: d, seed: 1, scaleSize: 7, lanes: 6 }).lanes).toBe(6);
    }
    expect(
      generateChart({ difficulty: 'easy', seed: 1, scaleSize: 7, lanes: 4, bars: 2 }).bars,
    ).toBe(2);
  });

  it('faixas válidas, notas dentro da ronda, ordenadas e com gaps mínimos', () => {
    for (const lanes of [2, 3, 4, 5, 6, 7, 8])
      for (const d of DIFFICULTIES)
        for (const seed of seeds)
          for (const scaleSize of [5, 6, 7]) {
            const c = generateChart({ difficulty: d, seed, scaleSize, lanes });
            const minGap = d === 'easy' ? 4 : 2;
            expect(c.notes.length).toBeGreaterThan(c.bars);
            c.notes.forEach((n, k) => {
              expect(n.lane).toBeGreaterThanOrEqual(0);
              expect(n.lane).toBeLessThan(c.lanes);
              expect(n.step).toBeGreaterThanOrEqual(0);
              expect(n.step).toBeLessThan(c.bars * 16);
              expect(n.dur).toBeGreaterThan(0);
              if (k === 0) return;
              const prev = c.notes[k - 1];
              expect(n.step - prev.step).toBeGreaterThanOrEqual(minGap);
              // na mesma faixa o dedo tem de subir e voltar a dobrar: pelo menos 1 tempo
              if (n.lane === prev.lane) expect(n.step - prev.step).toBeGreaterThanOrEqual(4);
            });
          }
  });

  it('sem semicolcheias: as notas caem em colcheias (e em semínimas no Fácil)', () => {
    for (const seed of seeds) {
      expect(
        generateChart({ difficulty: 'hard', seed, scaleSize: 7, lanes: 4 }).notes.every(
          (n) => n.step % 2 === 0,
        ),
      ).toBe(true);
      expect(
        generateChart({ difficulty: 'easy', seed, scaleSize: 7, lanes: 4 }).notes.every(
          (n) => n.step % 4 === 0,
        ),
      ).toBe(true);
    }
  });

  it('acaba com uma nota da tónica no último compasso', () => {
    for (const lanes of [2, 4, 8])
      for (const seed of seeds) {
        const c = generateChart({ difficulty: 'medium', seed, scaleSize: 7, lanes });
        const last = c.notes[c.notes.length - 1];
        expect(last.step).toBe((c.bars - 1) * 16);
        expect(last.lane % 7).toBe(0);
      }
  });

  it('a densidade sobe da primeira para a última secção', () => {
    let first = 0;
    let last = 0;
    for (const seed of seeds) {
      const c = generateChart({ difficulty: 'medium', seed, scaleSize: 7, lanes: 4 });
      first += c.notes.filter((n) => n.step < 8 * 16).length;
      last += c.notes.filter((n) => n.step >= (c.bars - 8) * 16).length;
    }
    expect(last).toBeGreaterThan(first);
  });

  it('acompanhamento: entrada com choques, bombo e tarola, baixo em cada compasso', () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4 });
    const intro = c.backing.filter((e) => e.step < 0);
    expect(intro.map((e) => e.step)).toEqual([0, 4, 8, 12].map((s) => s - COUNT_IN_STEPS));
    expect(intro.every((e) => e.kind === 'drum' && e.slot === DRUM_SLOT.hat)).toBe(true);
    const bar0 = c.backing.filter((e) => e.step >= 0 && e.step < 16);
    const at = (slot: number) =>
      bar0.filter((e) => e.kind === 'drum' && e.slot === slot).map((e) => e.step);
    expect(at(DRUM_SLOT.kick)).toEqual([0, 8]);
    expect(at(DRUM_SLOT.snare)).toEqual([4, 12]);
    expect(at(DRUM_SLOT.hat)).toEqual([0, 4, 8, 12]);
    expect(bar0.filter((e) => e.kind === 'bass').map((e) => e.step)).toEqual([0, 2, 8, 10]);
    const steps = c.backing.map((e) => e.step);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
    // nas outras dificuldades os choques vão em colcheias
    const m = generateChart({ difficulty: 'medium', seed: 3, scaleSize: 7, lanes: 4 });
    expect(
      m.backing.filter(
        (e) => e.step >= 0 && e.step < 16 && e.kind === 'drum' && e.slot === DRUM_SLOT.hat,
      ),
    ).toHaveLength(8);
  });

  it('o baixo segue a progressão, com graus dentro da escala', () => {
    expect(progressionFor(7)).toEqual([0, 5, 3, 4]);
    expect(progressionFor(5)).toEqual([0, 3, 2, 4]);
    expect(progressionFor(6)).toEqual([0, 3, 2, 4]);
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 5, lanes: 4 });
    const bass = c.backing.filter((e) => e.kind === 'bass');
    const last = bass[bass.length - 1];
    for (const b of bass) {
      if (b.kind !== 'bass') continue;
      if (b === last) continue;
      expect(b.degree).toBe(progressionFor(5)[Math.floor(b.step / 16) % 4]);
    }
  });

  it('o baixo do último compasso fica na tónica, para a música terminar resolvida', () => {
    for (const d of DIFFICULTIES)
      for (const seed of seeds) {
        const c = generateChart({ difficulty: d, seed, scaleSize: 7, lanes: 4 });
        const bass = c.backing.filter((e) => e.kind === 'bass');
        const last = bass[bass.length - 1];
        expect(last.step).toBe((c.bars - 1) * 16);
        if (last.kind === 'bass') expect(last.degree).toBe(0);
      }
  });
});

describe('estilos do acompanhamento, BPM e swing', () => {
  const at = (c: ReturnType<typeof generateChart>, slot: number, bar = 0) =>
    c.backing
      .filter((e) => e.step >= bar * 16 && e.step < (bar + 1) * 16 && e.kind === 'drum' && e.slot === slot)
      .map((e) => e.step);
  const bassAt = (c: ReturnType<typeof generateChart>, bar = 0) =>
    c.backing.filter((e) => e.step >= bar * 16 && e.step < (bar + 1) * 16 && e.kind === 'bass');

  it("bateria 'swing': bombo em [0, 10], choques a cada 2", () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, drums: 'swing' });
    expect(at(c, DRUM_SLOT.kick)).toEqual([0, 10]);
    expect(at(c, DRUM_SLOT.snare)).toEqual([4, 12]);
    expect(at(c, DRUM_SLOT.hat)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);
  });

  it("bateria 'four': bombo em [0,4,8,12], palmas em [4,12], prato aberto em [2,6,10,14]", () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, drums: 'four' });
    expect(at(c, DRUM_SLOT.kick)).toEqual([0, 4, 8, 12]);
    expect(at(c, DRUM_SLOT.clap)).toEqual([4, 12]);
    expect(at(c, DRUM_SLOT.openHat)).toEqual([2, 6, 10, 14]);
  });

  it("baixo 'walk': semínimas nos passos [0,4,8,12], graus [d, d+2, d+4, d+2]", () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, bassLine: 'walk' });
    const bass = bassAt(c, 0);
    const d = progressionFor(7)[0];
    expect(bass.map((b) => b.step)).toEqual([0, 4, 8, 12]);
    expect(bass.map((b) => (b.kind === 'bass' ? b.degree : null))).toEqual([d, d + 2, d + 4, d + 2]);
  });

  it("baixo 'pulse': colcheias em contratempo [2,6,10,14]", () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, bassLine: 'pulse' });
    expect(bassAt(c, 0).map((b) => b.step)).toEqual([2, 6, 10, 14]);
  });

  it('o último compasso fica igual em todos os estilos de bateria e de baixo (mesmo kit)', () => {
    const base = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4 });
    const lastBar = (c: ReturnType<typeof generateChart>) => c.backing.filter((e) => e.step >= 3 * 16);
    for (const drums of ['straight', 'swing', 'four'] as const)
      for (const bassLine of ['eighths', 'walk', 'pulse'] as const) {
        const c = generateChart({
          difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, drums, bassLine,
        });
        expect(lastBar(c)).toEqual(lastBar(base));
      }
  });

  it('crashSlotFor: a pancada final usa o slot do kit (o acústico tem crash; o tr808 não)', () => {
    expect(crashSlotFor('drums')).toBe(9);
    expect(crashSlotFor('tr808')).toBe(DRUM_SLOT.openHat);
    expect(crashSlotFor('kit-desconhecido')).toBe(DRUM_SLOT.hat);
  });

  it('a pancada final usa o slot do kit pedido (`kit`), não sempre o crash acústico', () => {
    const acoustic = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4 });
    const tr808 = generateChart({
      difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, bars: 4, kit: 'tr808',
    });
    const finalHit = (c: ReturnType<typeof generateChart>): number | undefined => {
      const e = c.backing.find(
        (x) => x.step === 3 * 16 && x.kind === 'drum' && x.slot !== DRUM_SLOT.kick,
      );
      return e && e.kind === 'drum' ? e.slot : undefined;
    };
    expect(finalHit(acoustic)).toBe(9);
    expect(finalHit(tr808)).toBe(DRUM_SLOT.openHat);
  });

  it('o bpm substitui o da dificuldade: usa-se no gap mínimo entre notas da mesma mão', () => {
    // Difícil (denso, para ter notas rápidas o bastante para testar) a 200 BPM: um gap de 4
    // passos, mais apertado que o do Difícil de base (130 BPM, gap de 3) — se o gerador usasse
    // na realidade `cfg.bpm` (130) em vez do `bpm` passado, este teste apanhava-o.
    const split = 2;
    const lanes = 4;
    const hand = (lane: number) => (lane < split ? 0 : 1);
    const c = generateChart({ difficulty: 'hard', seed: 3, scaleSize: 7, lanes, split, bpm: 200 });
    expect(c.bpm).toBe(200);
    const gap = minGapSteps(200);
    expect(gap).toBe(4);
    expect(gap).toBeGreaterThan(minGapSteps(DIFFICULTY.hard.bpm));
    const lastOf = new Map<number, number>();
    for (const n of c.notes) {
      const h = hand(n.lane);
      const p = lastOf.get(h);
      if (p !== undefined) expect(n.step - p).toBeGreaterThanOrEqual(gap);
      lastOf.set(h, n.step);
    }
    // confirma que o teste exercita mesmo o gap: há notas rápidas o bastante para testar
    expect(c.notes.length).toBeGreaterThan(20);
  });

  it('o swing passa para a Chart (0 por defeito)', () => {
    expect(generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4 }).swing).toBe(0);
    expect(
      generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7, lanes: 4, swing: 0.6 }).swing,
    ).toBe(0.6);
  });

  it('os invariantes de hoje valem com os parâmetros dos níveis, em 20 sementes cada', () => {
    const split = 2;
    const lanes = 4;
    const hand = (lane: number) => (lane < split ? 0 : 1);
    for (const lvl of LEVELS)
      for (const seed of seeds) {
        const c = generateChart({
          difficulty: lvl.difficulty,
          seed,
          scaleSize: 7,
          lanes,
          split,
          bars: lvl.bars,
          bpm: lvl.bpm,
          drums: lvl.style.drums,
          bassLine: lvl.style.bassLine,
          swing: lvl.style.swing,
        });
        expect(c.bpm).toBe(lvl.bpm);
        expect(c.swing).toBe(lvl.style.swing);
        const gap = minGapSteps(lvl.bpm);
        const lastOf = new Map<number, number>();
        c.notes.forEach((n, k) => {
          expect(n.lane).toBeGreaterThanOrEqual(0);
          expect(n.lane).toBeLessThan(c.lanes);
          const h = hand(n.lane);
          const p = lastOf.get(h);
          if (p !== undefined) expect(n.step - p).toBeGreaterThanOrEqual(gap);
          lastOf.set(h, n.step);
          if (k === 0) return;
          const prev = c.notes[k - 1];
          if (n.lane === prev.lane) expect(n.step - prev.step).toBeGreaterThanOrEqual(4);
        });
        const last = c.notes[c.notes.length - 1];
        expect(last.step).toBe((c.bars - 1) * 16);
        expect(last.lane % 7).toBe(0);
      }
  });

  it('com uma só mão e swing (como o Lo-fi), o intervalo real nunca fica abaixo de 0,30 s', () => {
    // split 0 (uma só mão): sem `alternateHands` a ajudar, é só o `enforceMinGap` com swing que
    // garante a distância real; antes da correção, uma colcheia em contratempo seguida de uma
    // nota no tempo seguinte podia ficar a ~0,22 s (96 BPM, swing 0,6) em vez de 0,30 s.
    const lofi = LEVELS[levelIndex('lofi')];
    const stepDur = 60 / lofi.bpm / 4;
    for (const lanes of [3, 4, 5])
      for (const seed of seeds) {
        const c = generateChart({
          difficulty: lofi.difficulty,
          seed,
          scaleSize: 7,
          lanes,
          split: 0,
          bars: lofi.bars,
          bpm: lofi.bpm,
          drums: lofi.style.drums,
          bassLine: lofi.style.bassLine,
          swing: lofi.style.swing,
        });
        c.notes.forEach((n, k) => {
          if (k === 0) return;
          const prev = c.notes[k - 1];
          const gapS = (swungStep(n.step, c.swing) - swungStep(prev.step, c.swing)) * stepDur;
          expect(gapS).toBeGreaterThanOrEqual(MIN_NOTE_GAP_S - 1e-9);
        });
      }
  });
});

describe('notas possíveis na câmara', () => {
  it('intervalo mínimo em passos: 0,30 s arredondado para cima', () => {
    expect(minGapSteps(90)).toBe(2);
    expect(minGapSteps(110)).toBe(3);
    expect(minGapSteps(130)).toBe(3);
  });

  it('enforceMinGap tira as notas demasiado juntas e mantém a final', () => {
    const ns = [
      { step: 0, lane: 0 },
      { step: 2, lane: 1 },
      { step: 3, lane: 2 },
      { step: 8, lane: 0 },
      { step: 10, lane: 1 },
    ];
    // a final (10) fica; a do 8 sai por estar a 2 passos dela
    expect(enforceMinGap(ns, 3)).toEqual([
      { step: 0, lane: 0 },
      { step: 3, lane: 2 },
      { step: 10, lane: 1 },
    ]);
  });

  it('enforceMinGap por mão: as notas da outra mão no meio não contam', () => {
    // 4 faixas, split 2: 0 e 1 são da esquerda
    const ns = [
      { step: 0, lane: 0 },
      { step: 2, lane: 3 },
      { step: 4, lane: 2 },
      { step: 6, lane: 1 },
      { step: 12, lane: 0 },
    ];
    // a do 4 sai (a 2 passos da do 2, mesma mão); a do 6 fica (a 6 passos da do 0)
    expect(enforceMinGap(ns, 3, 2, 4)).toEqual([
      { step: 0, lane: 0 },
      { step: 2, lane: 3 },
      { step: 6, lane: 1 },
      { step: 12, lane: 0 },
    ]);
  });

  it('enforceMinGap por mão: se a final colidir, sai a anterior da mesma mão', () => {
    const ns = [
      { step: 0, lane: 0 },
      { step: 8, lane: 1 },
      { step: 9, lane: 3 },
      { step: 10, lane: 0 },
    ];
    expect(enforceMinGap(ns, 3, 2, 4)).toEqual([
      { step: 0, lane: 0 },
      { step: 9, lane: 3 },
      { step: 10, lane: 0 },
    ]);
  });

  it('enforceMinGap com swing: conta a posição real da colcheia em contratempo', () => {
    // o passo 2 é swung (soa a 2,6): a 4, a distância real é só 1,4 passos, não 2 — a última
    // nota (a 4) fica sempre (regra da final) e é a anterior (a 2) que sai
    const ns = [
      { step: 2, lane: 0 },
      { step: 4, lane: 1 },
    ];
    expect(enforceMinGap(ns, 2, 0, 0, 0.6)).toEqual([{ step: 4, lane: 1 }]);
    // sem swing (0, por defeito) os mesmos passos já cumprem a distância de 2: ficam as duas
    expect(enforceMinGap(ns, 2)).toEqual(ns);
  });

  it('mirrorLane: a mesma distância da divisória, na outra mão', () => {
    expect([0, 1, 2, 3].map((l) => mirrorLane(l, 2, 4))).toEqual([3, 2, 1, 0]);
    // mãos desiguais: limitada às faixas da outra mão
    expect([0, 1, 2, 3, 4, 5].map((l) => mirrorLane(l, 2, 6))).toEqual([3, 2, 1, 0, 0, 0]);
    expect([0, 1, 2].map((l) => mirrorLane(l, 1, 3))).toEqual([1, 0, 0]);
  });

  it('alternateHands: notas a menos de 1 tempo vão para a faixa espelhada da outra mão', () => {
    // 4 faixas, 2 da esquerda: 0 e 1 são da esquerda
    const out = alternateHands(
      [
        { step: 0, lane: 1 },
        { step: 2, lane: 0 },
        { step: 8, lane: 1 },
        { step: 10, lane: 1 },
        { step: 16, lane: 3 },
      ],
      2,
      4,
    );
    // a do 2 (faixa 0, a mais longe da divisória) passa para a 3; a do 10 (faixa 1) para a 2
    expect(out).toEqual([
      { step: 0, lane: 1 },
      { step: 2, lane: 3 },
      { step: 8, lane: 1 },
      { step: 10, lane: 2 },
      { step: 16, lane: 3 },
    ]);
  });

  it('alternateHands com uma só mão não muda nada', () => {
    const ns = [
      { step: 0, lane: 0 },
      { step: 2, lane: 1 },
    ];
    expect(alternateHands(ns, 0, 4)).toEqual(ns);
    expect(alternateHands(ns, 4, 4)).toEqual(ns);
  });

  it('alternateHands: se a final colidir com a anterior, a anterior sai', () => {
    expect(
      alternateHands(
        [
          { step: 0, lane: 2 },
          { step: 13, lane: 0 },
          { step: 16, lane: 1 },
        ],
        2,
        4,
      ),
    ).toEqual([
      { step: 0, lane: 2 },
      { step: 16, lane: 1 },
    ]);
  });

  const SPLITS = [
    [4, 2],
    [4, 0],
    [4, 4],
    [6, 3],
    [8, 4],
    [3, 1],
    [2, 1],
  ] as const;
  const hand = (lane: number, split: number, lanes: number) =>
    split <= 0 || split >= lanes || lane < split ? 0 : 1;

  it('gerador: 0,30 s entre notas da mesma mão e 1 tempo na mesma faixa', () => {
    for (const d of DIFFICULTIES)
      for (const seed of seeds)
        for (const [lanes, split] of SPLITS) {
          const c = generateChart({ difficulty: d, seed, scaleSize: 7, lanes, split });
          const gap = minGapSteps(DIFFICULTY[d].bpm);
          const lastOf = new Map<number, number>();
          c.notes.forEach((n, k) => {
            const h = hand(n.lane, split, lanes);
            const p = lastOf.get(h);
            if (p !== undefined) expect(n.step - p).toBeGreaterThanOrEqual(gap);
            lastOf.set(h, n.step);
            if (k === 0) return;
            const prev = c.notes[k - 1];
            expect(n.step).toBeGreaterThan(prev.step);
            if (n.lane === prev.lane) expect(n.step - prev.step).toBeGreaterThanOrEqual(4);
          });
          const last = c.notes[c.notes.length - 1];
          expect(last.step).toBe((c.bars - 1) * 16);
          expect(last.lane % 7).toBe(0);
        }
  });

  it('gerador: com uma só mão, nunca menos de 0,30 s entre notas seguidas', () => {
    for (const d of DIFFICULTIES)
      for (const seed of seeds)
        for (const split of [0, 4]) {
          const c = generateChart({ difficulty: d, seed, scaleSize: 7, lanes: 4, split });
          const gap = minGapSteps(DIFFICULTY[d].bpm);
          c.notes.forEach((n, k) => {
            if (k) expect(n.step - c.notes[k - 1].step).toBeGreaterThanOrEqual(gap);
          });
        }
  });

  it('gerador: com as duas mãos, Médio e Difícil têm notas rápidas, sempre em mãos alternadas', () => {
    for (const d of ['medium', 'hard'] as const)
      for (const [lanes, split] of SPLITS) {
        if (split <= 0 || split >= lanes) continue;
        let fast = 0;
        for (const seed of seeds) {
          const c = generateChart({ difficulty: d, seed, scaleSize: 7, lanes, split });
          c.notes.forEach((n, k) => {
            if (k === 0) return;
            const prev = c.notes[k - 1];
            if (n.step - prev.step >= 4) return;
            fast++;
            expect(hand(n.lane, split, lanes)).not.toBe(hand(prev.lane, split, lanes));
          });
        }
        // por ronda: ~50 no Médio e ~120 no Difícil com 4 faixas; aqui basta muitas
        expect(fast, `${d} ${lanes}/${split}`).toBeGreaterThanOrEqual(seeds.length * 20);
      }
  });
});
