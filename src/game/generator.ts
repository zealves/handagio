// Modo de jogo: partitura procedural (melodia nas faixas + bateria e baixo). Pura e
// determinística: a mesma semente dá a mesma ronda.
import { COUNT_IN_STEPS, DIFFICULTY } from './config';
import { mulberry32 } from './rng';
import type { BackingEvent, Chart, ChartNote, Difficulty } from './types';

const BAR = 16;
const BEAT = 4;
/** Forma: secções de 8 compassos A A' B A, com frases de 2 compassos. */
const SECTION_BARS = 8;
const PHRASE_BARS = 2;
/** Na mesma faixa, pelo menos 1 tempo entre notas (o dedo tem de subir e voltar a dobrar). */
const SAME_LANE_GAP = 4;
/** No tempo 1 de cada compasso, a probabilidade de a melodia ir para uma nota do acorde. */
const CHORD_PULL = 0.7;

/** Slots do kit acústico (`src/audio/drums/acoustic.ts`). */
export const DRUM_SLOT = { kick: 0, snare: 1, hat: 2, crash: 9 } as const;

/**
 * Probabilidade de uma nota em cada tempo (da primeira à última secção) e, quando há nota,
 * de ser um par de colcheias (`eighth`) ou só o contratempo (`sync`). Sem semicolcheias: a
 * câmara a 30 fps não as distingue.
 */
const DENSITY: Record<Difficulty, { from: number; to: number; eighth: number; sync: number }> = {
  easy: { from: 0.45, to: 0.75, eighth: 0, sync: 0 },
  medium: { from: 0.55, to: 0.85, eighth: 0.3, sync: 0 },
  hard: { from: 0.65, to: 0.95, eighth: 0.45, sync: 0.15 },
};

/** Progressão de 4 compassos em graus da escala (I vi IV V; nas escalas pequenas, I IV III V). */
export const progressionFor = (scaleSize: number): number[] =>
  (scaleSize >= 7 ? [0, 5, 3, 4] : [0, 3, 2, 4]).map((d) => d % scaleSize);

export interface GenerateOptions {
  difficulty: Difficulty;
  seed: number;
  /** Notas por oitava da escala do jogador (`scaleLength`). */
  scaleSize: number;
  /** Compassos (diagnóstico e testes); por defeito os da dificuldade. Mínimo 2. */
  bars?: number;
}

type Rnd = () => number;
interface Onset {
  step: number;
  lane: number;
}

export function generateChart(o: GenerateOptions): Chart {
  const cfg = DIFFICULTY[o.difficulty];
  const bars = Math.max(2, Math.round(o.bars ?? cfg.bars));
  const lanes = cfg.fingers.length;
  const rng = mulberry32(o.seed);
  const prog = progressionFor(o.scaleSize);
  const dens = DENSITY[o.difficulty];
  const walk = { lane: Math.floor(lanes / 2) };
  const chordLanes = (bar: number) => {
    const root = prog[bar % prog.length];
    return Array.from({ length: lanes }, (_, l) => l).filter((l) =>
      [0, 2, 4].includes((((l - root) % o.scaleSize) + o.scaleSize) % o.scaleSize),
    );
  };
  const makeBar = (bar: number, p: number): Onset[] => {
    const out: Onset[] = [];
    for (let beat = 0; beat < 4; beat++)
      for (const off of beatOnsets(rng, dens, p)) {
        const step = beat * BEAT + off;
        const targets = step === 0 ? chordLanes(bar) : null;
        walk.lane = nextLane(rng, walk.lane, lanes, targets);
        out.push({ step, lane: walk.lane });
      }
    return out;
  };
  const makePhrase = (bar: number, p: number): Onset[] => [
    ...makeBar(bar, p),
    ...makeBar(bar + 1, p).map((n) => ({ ...n, step: n.step + BAR })),
  ];

  const onsets: Onset[] = [];
  const sections = Math.ceil(bars / SECTION_BARS);
  for (let sec = 0; sec < sections; sec++) {
    const k = sections === 1 ? 0 : sec / (sections - 1);
    const p = dens.from + (dens.to - dens.from) * k;
    const b0 = sec * SECTION_BARS;
    const a = makePhrase(b0, p);
    // A' é A com o segundo compasso refeito
    const a2 = [
      ...a.filter((n) => n.step < BAR),
      ...makeBar(b0 + 3, p).map((n) => ({ ...n, step: n.step + BAR })),
    ];
    const b = makePhrase(b0 + 4, p);
    [a, a2, b, a].forEach((phrase, i) => {
      const base = (b0 + i * PHRASE_BARS) * BAR;
      for (const n of phrase) onsets.push({ step: base + n.step, lane: n.lane });
    });
  }
  // o último compasso fica para a nota final (a tónica mais perto de onde a melodia está)
  const tonics = Array.from({ length: lanes }, (_, l) => l).filter((l) => l % o.scaleSize === 0);
  const end = { step: (bars - 1) * BAR, lane: nearest(tonics, walk.lane) };
  // sem notas na faixa da final a menos de 1 tempo dela (o `spaceLanes` mudá-la-ia de faixa)
  const body = onsets.filter(
    (n) => n.step < end.step && !(n.lane === end.lane && end.step - n.step < SAME_LANE_GAP),
  );
  body.push(end);

  const notes = spaceLanes(body, lanes).map((n, k, all): ChartNote => ({
    ...n,
    dur: k + 1 < all.length ? Math.min(BEAT, all[k + 1].step - n.step) : BEAT,
  }));
  return { bpm: cfg.bpm, bars, lanes, notes, backing: backing(bars, o.difficulty, prog) };
}

function beatOnsets(rng: Rnd, d: (typeof DENSITY)[Difficulty], p: number): number[] {
  if (rng() >= p) return [];
  const r = rng();
  if (r < d.sync) return [2];
  if (r < d.sync + d.eighth) return [0, 2];
  return [0];
}

/** Passeio pelas faixas: quase sempre ±1, às vezes saltos de 2–3; no tempo 1 puxa para o acorde. */
function nextLane(rng: Rnd, cur: number, lanes: number, targets: number[] | null): number {
  if (targets?.length && rng() < CHORD_PULL) return nearest(targets, cur);
  const r = rng();
  const size = r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
  const dir = rng() < 0.5 ? -1 : 1;
  let n = cur + dir * size;
  if (n < 0 || n >= lanes) n = cur - dir * size;
  return Math.max(0, Math.min(lanes - 1, n));
}

const nearest = (xs: number[], to: number): number =>
  xs.reduce((best, x) => (Math.abs(x - to) < Math.abs(best - to) ? x : best), xs[0] ?? 0);

/**
 * Ordena e garante 1 tempo entre notas seguidas na mesma faixa (muda para a faixa ao lado).
 * A última nota (a tónica final) nunca é tocada por este afastamento: se ela colidir com a
 * anterior, é a anterior que muda de faixa, para uma diferente da sua própria antecessora e
 * da faixa da final (para não voltar a colidir com nenhuma das duas).
 */
export function spaceLanes(ns: Onset[], lanes: number): Onset[] {
  const out = [...ns].sort((a, b) => a.step - b.step);
  const lastIdx = out.length - 1;
  for (let k = 1; k < out.length; k++) {
    const prev = out[k - 1];
    const n = out[k];
    if (n.lane !== prev.lane || n.step - prev.step >= SAME_LANE_GAP) continue;
    if (k < lastIdx) {
      out[k] = { ...n, lane: n.lane + 1 < lanes ? n.lane + 1 : n.lane - 1 };
      continue;
    }
    // `n` é a nota final: mantém-se; muda-se `prev` em vez disso.
    const before = k >= 2 ? out[k - 2].lane : -1;
    const avoid = new Set([before, n.lane]);
    let lane = 0;
    while (avoid.has(lane) && lane < lanes - 1) lane++;
    out[k - 1] = { ...prev, lane };
  }
  return out;
}

function backing(bars: number, d: Difficulty, prog: number[]): BackingEvent[] {
  const ev: BackingEvent[] = [];
  const drum = (step: number, slot: number, vel: number) =>
    ev.push({ step, kind: 'drum', slot, vel });
  // entrada: choques nos 4 tempos
  for (let b = 0; b < 4; b++) drum(-COUNT_IN_STEPS + b * BEAT, DRUM_SLOT.hat, 0.6);
  const hatEvery = d === 'easy' ? BEAT : 2;
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * BAR;
    const degree = prog[bar % prog.length];
    if (bar === bars - 1) {
      drum(base, DRUM_SLOT.kick, 0.9);
      drum(base, DRUM_SLOT.crash, 0.6);
      // a tónica (grau 0), para a música terminar resolvida em vez de ficar no V
      ev.push({ step: base, kind: 'bass', degree: 0, dur: BAR, vel: 0.7 });
      continue;
    }
    for (let s = 0; s < BAR; s += hatEvery) drum(base + s, DRUM_SLOT.hat, 0.45);
    drum(base, DRUM_SLOT.kick, 0.9);
    drum(base + 8, DRUM_SLOT.kick, 0.8);
    drum(base + 4, DRUM_SLOT.snare, 0.7);
    drum(base + 12, DRUM_SLOT.snare, 0.7);
    for (const s of [0, 2, 8, 10])
      ev.push({ step: base + s, kind: 'bass', degree, dur: 2, vel: 0.7 });
  }
  // ordenação estável: no mesmo passo fica a ordem de inserção
  return ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.step - b.e.step || a.i - b.i)
    .map((x) => x.e);
}
