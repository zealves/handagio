import { describe, expect, it } from 'vitest';
import { COUNT_IN_STEPS, DIFFICULTIES, DIFFICULTY } from './config';
import { DRUM_SLOT, generateChart, progressionFor, spaceLanes } from './generator';

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
});

describe('generateChart', () => {
  it('a mesma semente dá a mesma partitura', () => {
    const a = generateChart({ difficulty: 'medium', seed: 7, scaleSize: 7 });
    expect(generateChart({ difficulty: 'medium', seed: 7, scaleSize: 7 })).toEqual(a);
    expect(generateChart({ difficulty: 'medium', seed: 8, scaleSize: 7 }).notes).not.toEqual(
      a.notes,
    );
  });

  it('usa o BPM, os compassos e as faixas da dificuldade', () => {
    for (const d of DIFFICULTIES) {
      const c = generateChart({ difficulty: d, seed: 1, scaleSize: 7 });
      expect(c.bpm).toBe(DIFFICULTY[d].bpm);
      expect(c.bars).toBe(DIFFICULTY[d].bars);
      expect(c.lanes).toBe(DIFFICULTY[d].fingers.length);
    }
    expect(generateChart({ difficulty: 'easy', seed: 1, scaleSize: 7, bars: 2 }).bars).toBe(2);
  });

  it('faixas válidas, notas dentro da ronda, ordenadas e com gaps mínimos', () => {
    for (const d of DIFFICULTIES)
      for (const seed of seeds)
        for (const scaleSize of [5, 6, 7]) {
          const c = generateChart({ difficulty: d, seed, scaleSize });
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
        generateChart({ difficulty: 'hard', seed, scaleSize: 7 }).notes.every(
          (n) => n.step % 2 === 0,
        ),
      ).toBe(true);
      expect(
        generateChart({ difficulty: 'easy', seed, scaleSize: 7 }).notes.every(
          (n) => n.step % 4 === 0,
        ),
      ).toBe(true);
    }
  });

  it('acaba com uma nota da tónica no último compasso', () => {
    for (const seed of seeds) {
      const c = generateChart({ difficulty: 'medium', seed, scaleSize: 7 });
      const last = c.notes[c.notes.length - 1];
      expect(last.step).toBe((c.bars - 1) * 16);
      expect(last.lane % 7).toBe(0);
    }
  });

  it('a densidade sobe da primeira para a última secção', () => {
    let first = 0;
    let last = 0;
    for (const seed of seeds) {
      const c = generateChart({ difficulty: 'medium', seed, scaleSize: 7 });
      first += c.notes.filter((n) => n.step < 8 * 16).length;
      last += c.notes.filter((n) => n.step >= (c.bars - 8) * 16).length;
    }
    expect(last).toBeGreaterThan(first);
  });

  it('acompanhamento: entrada com choques, bombo e tarola, baixo em cada compasso', () => {
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 7 });
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
    const m = generateChart({ difficulty: 'medium', seed: 3, scaleSize: 7 });
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
    const c = generateChart({ difficulty: 'easy', seed: 3, scaleSize: 5 });
    const bass = c.backing.filter((e) => e.kind === 'bass');
    for (const b of bass) {
      if (b.kind !== 'bass') continue;
      expect(b.degree).toBe(progressionFor(5)[Math.floor(b.step / 16) % 4]);
    }
  });
});
