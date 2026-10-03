// Modo de jogo: partitura procedural (melodia nas faixas + bateria e baixo). Pura e
// determinística: a mesma semente dá a mesma ronda.
import { COUNT_IN_STEPS, DIFFICULTY, MIN_NOTE_GAP_S } from './config';
import type { BassLine, DrumStyle } from './levels';
import { mulberry32 } from './rng';
import { SONG_TOP_DEGREE, type Song } from './songs';
import type { BackingEvent, Chart, ChartNote, Difficulty } from './types';

const BAR = 16;
const BEAT = 4;
/** Forma: secções de 8 compassos A A' B A, com frases de 2 compassos. */
const SECTION_BARS = 8;
const PHRASE_BARS = 2;
/** Na mesma faixa, pelo menos 1 tempo entre notas (o dedo tem de subir e voltar a dobrar). */
const SAME_LANE_GAP = 4;
/** Uma música escrita toca-se duas vezes por ronda. */
const SONG_PASSES = 2;
/** Volume do tapete de acordes (fica por baixo da melodia). */
const PAD_VEL = 0.25;
/** Volume do baixo escrito das músicas. */
const SONG_BASS_VEL = 0.65;
/** No tempo 1 de cada compasso, a probabilidade de a melodia ir para uma nota do acorde. */
const CHORD_PULL = 0.7;

/**
 * Slots comuns aos kits usados pelo jogo (`src/audio/drums/acoustic.ts` e `tr808.ts`): bombo,
 * tarola, choques, prato aberto, palmas, pela mesma ordem nos dois. (O `latin.ts` não segue
 * esta ordem — precisaria do seu próprio mapa se algum nível vier a usá-lo.)
 */
export const DRUM_SLOT = { kick: 0, snare: 1, hat: 2, openHat: 3, clap: 4 } as const;

/**
 * Pancada final da ronda (hoje um crash), por kit: o acústico (`drums`) tem um crash dedicado
 * (slot 9); o `tr808` não, por isso usa o prato aberto. Um kit sem entrada aqui cai no choque.
 */
const CRASH_SLOT: Readonly<Record<string, number>> = { drums: 9, tr808: DRUM_SLOT.openHat };
export const crashSlotFor = (kit: string): number => CRASH_SLOT[kit] ?? DRUM_SLOT.hat;

/** Posição real do passo `step` com o swing: a colcheia em contratempo soa `swing` passos depois. */
export const swungStep = (step: number, swing: number): number =>
  step + (((step % 4) + 4) % 4 === 2 ? swing : 0);

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
  /** Faixas (2–8), uma por dedo escolhido. */
  lanes: number;
  /** Compassos (diagnóstico e testes); por defeito os da dificuldade. Mínimo 2. */
  bars?: number;
  /** Faixas da mão esquerda ([0, split)); por defeito metade. */
  split?: number;
  /** BPM; por defeito o da dificuldade. Também usado no intervalo mínimo entre notas. */
  bpm?: number;
  /** Padrão da bateria por compasso; por defeito `straight` (o de sempre). */
  drums?: DrumStyle;
  /** Padrão do baixo por compasso; por defeito `eighths` (o de sempre). */
  bassLine?: BassLine;
  /** Atraso das colcheias em contratempo (passos; 0 = direito), guardado na `Chart`. */
  swing?: number;
  /** Kit da bateria (`src/audio/drums/*.ts`), para escolher a pancada final; por defeito `drums`. */
  kit?: string;
  /**
   * Música escrita à mão (`songs.ts`): a melodia passa para as faixas e o acompanhamento sai
   * dela, em vez do passeio e dos padrões gerados. Os instrumentos ficam no nível.
   */
  song?: Song;
}

type Rnd = () => number;
export interface Onset {
  step: number;
  lane: number;
}
/** Uma nota com a duração escrita (só nas músicas; sem ela, a duração vem da nota seguinte). */
type TimedOnset = Onset & { dur?: number };

/**
 * Faixa do grau `d` (0..7) de uma música com `lanes` faixas: com 8 é o próprio grau; com menos,
 * a escala comprime-se e o desenho da melodia mantém-se (nunca desce quando o grau sobe).
 */
export const songLane = (d: number, lanes: number): number =>
  Math.round((d * (lanes - 1)) / SONG_TOP_DEGREE);

export function generateChart(o: GenerateOptions): Chart {
  if (o.song) return songChart(o, o.song);
  const cfg = DIFFICULTY[o.difficulty];
  const bpm = o.bpm ?? cfg.bpm;
  const bars = Math.max(2, Math.round(o.bars ?? cfg.bars));
  const lanes = Math.max(2, Math.min(8, Math.round(o.lanes)));
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

  const split = Math.max(0, Math.min(lanes, Math.round(o.split ?? Math.floor(lanes / 2))));
  // regras de jogo: ver `playableNotes`
  const swing = o.swing ?? 0;
  const notes = playableNotes(body, lanes, split, bpm, swing);
  return {
    bpm,
    bars,
    lanes,
    notes,
    backing: backing(
      bars,
      o.difficulty,
      prog,
      o.drums ?? 'straight',
      o.bassLine ?? 'eighths',
      o.kit ?? 'drums',
    ),
    swing,
    split,
  };
}

/**
 * Ronda a partir de uma música escrita: a melodia (duas passagens, ou menos com `o.bars`)
 * mapeada para as faixas com `songLane`, as mesmas regras de jogo da partitura procedural e o
 * acompanhamento escrito (`songBacking`). Com 8 faixas as regras não mexem em nenhuma nota
 * (as músicas escrevem-se para isso; `songs.test.ts` confirma).
 */
function songChart(o: GenerateOptions, song: Song): Chart {
  const bpm = o.bpm ?? DIFFICULTY[o.difficulty].bpm;
  const full = song.bars * SONG_PASSES;
  const bars = Math.max(2, Math.min(full, Math.round(o.bars ?? full)));
  const lanes = Math.max(2, Math.min(8, Math.round(o.lanes)));
  const split = Math.max(0, Math.min(lanes, Math.round(o.split ?? Math.floor(lanes / 2))));
  const swing = o.swing ?? 0;
  const endStep = (bars - 1) * BAR;
  const written: TimedOnset[] = [];
  for (let pass = 0; pass < SONG_PASSES; pass++)
    for (const n of song.melody) {
      const step = pass * song.bars * BAR + n.step;
      if (step <= endStep) written.push({ step, lane: songLane(n.degree, lanes), dur: n.dur });
    }
  // a final: a nota escrita no início do último compasso (na música, a tónica) ou, com a ronda
  // cortada, a tónica mais perto de onde a melodia está; sempre numa faixa que toca a tónica
  const tonics = Array.from({ length: lanes }, (_, l) => l).filter((l) => l % o.scaleSize === 0);
  const atEnd = written.find((n) => n.step === endStep);
  const before = written.filter((n) => n.step < endStep);
  const from = atEnd?.lane ?? before[before.length - 1]?.lane ?? 0;
  const end: TimedOnset = { step: endStep, lane: nearest(tonics, from), dur: atEnd?.dur ?? BAR };
  const body = before.filter((n) => !(n.lane === end.lane && end.step - n.step < SAME_LANE_GAP));
  body.push(end);
  return {
    bpm,
    bars,
    lanes,
    notes: playableNotes(body, lanes, split, bpm, swing),
    backing: songBacking(song, bars, o.kit ?? 'drums'),
    swing,
    split,
  };
}

/**
 * Regras de jogo, por esta ordem: 1) `alternateHands` põe na outra mão as notas a menos de 1
 * tempo da anterior; 2) `enforceMinGap` garante 0,30 s entre notas da mesma mão (com uma só
 * mão, entre todas); 3) `spaceLanes` garante 1 tempo na mesma faixa. As notas estão em passos
 * pares, por isso, depois de 1), duas notas seguidas da mesma mão já estão a 1 tempo ou mais e
 * uma nota mudada de mão fica a ≥ 1 tempo da anterior dessa mão: com as duas mãos, 2) e 3)
 * quase não têm nada a fazer e não desfazem a alternância (3) só muda notas seguidas na mesma
 * faixa, logo na mesma mão, e com duas mãos essas já estão a ≥ 1 tempo). Com uma só mão, 1)
 * não faz nada e 2) e 3) dão o mesmo que antes. Nenhum dos passos tira nem muda a final.
 * A duração é a escrita (ou 1 tempo), limitada pela nota seguinte.
 */
function playableNotes(
  body: TimedOnset[],
  lanes: number,
  split: number,
  bpm: number,
  swing: number,
): ChartNote[] {
  const hands = alternateHands(body, split, lanes);
  const playable = enforceMinGap(hands, minGapStepsExact(bpm), split, lanes, swing);
  return spaceLanes(playable, lanes).map((n, k, all): ChartNote => {
    const dur = n.dur ?? BEAT;
    return {
      step: n.step,
      lane: n.lane,
      dur: k + 1 < all.length ? Math.min(dur, all[k + 1].step - n.step) : dur,
    };
  });
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

/** `MIN_NOTE_GAP_S` em passos (semicolcheias) a este BPM, exato (sem arredondar). */
export function minGapStepsExact(bpm: number): number {
  const stepDur = 60 / bpm / BEAT;
  return MIN_NOTE_GAP_S / stepDur;
}

/** `MIN_NOTE_GAP_S` em passos (semicolcheias) a este BPM, arredondado para cima. */
export function minGapSteps(bpm: number): number {
  return Math.ceil(minGapStepsExact(bpm) - 1e-9);
}

/** Mão de uma faixa (0: esquerda, `[0, split)`; 1: direita). Com uma só mão, sempre 0. */
const handOf = (lane: number, split: number, lanes: number): number =>
  split <= 0 || split >= lanes || lane < split ? 0 : 1;

/**
 * Tira as notas a menos de `steps` da anterior que ficou na mesma mão (ordenadas; as notas da
 * outra mão no meio não contam). Com `swing`, a distância conta a posição real da colcheia em
 * contratempo (`swungStep`), que soa `swing` passos mais tarde — sem isso, uma nota swung e a
 * seguinte na mesma mão podiam ficar a menos de `MIN_NOTE_GAP_S` segundos uma da outra mesmo
 * com uma distância em passos aparentemente suficiente. A última (a final na tónica) fica
 * sempre: se colidir, sai a anterior da mesma mão. Sem `split`/`lanes`, ou com uma só mão, vale
 * entre todas as notas.
 */
export function enforceMinGap<T extends Onset>(
  ns: T[],
  steps: number,
  split = 0,
  lanes = 0,
  swing = 0,
): T[] {
  const sorted = [...ns].sort((a, b) => a.step - b.step);
  const out: T[] = [];
  const hand = (n: Onset) => handOf(n.lane, split, lanes);
  sorted.forEach((n, k) => {
    let p = out.length - 1;
    while (p >= 0 && hand(out[p]) !== hand(n)) p--;
    const gap = p < 0 ? Infinity : swungStep(n.step, swing) - swungStep(out[p].step, swing);
    if (p < 0 || gap >= steps - 1e-9) out.push(n);
    else if (k === sorted.length - 1) {
      out.splice(p, 1);
      out.push(n);
    }
  });
  return out;
}

/**
 * Faixa da outra mão à mesma distância da divisória (o espelho), limitada às faixas dela:
 * com 4 faixas e `split` 2, 0 ↔ 3 e 1 ↔ 2.
 */
export function mirrorLane(lane: number, split: number, lanes: number): number {
  if (lane < split) return split + Math.min(split - 1 - lane, lanes - split - 1);
  return split - 1 - Math.min(lane - split, split - 1);
}

/**
 * Notas a menos de 1 tempo da anterior vão para a outra mão (faixas `[0, split)` são da
 * esquerda), para a faixa espelhada (`mirrorLane`), para os pares rápidos não ficarem sempre
 * nos dois dedos do meio. Com uma só mão não muda nada. A final não muda: se colidir com a
 * anterior, sai a anterior.
 */
export function alternateHands<T extends Onset>(ns: T[], split: number, lanes: number): T[] {
  if (split <= 0 || split >= lanes) return ns;
  const left = (l: number) => l < split;
  const out = [...ns].sort((a, b) => a.step - b.step);
  for (let k = 1; k < out.length; k++) {
    const prev = out[k - 1];
    const n = out[k];
    if (n.step - prev.step >= BEAT || left(n.lane) !== left(prev.lane)) continue;
    if (k === out.length - 1) {
      out.splice(k - 1, 1);
      break;
    }
    out[k] = { ...n, lane: mirrorLane(n.lane, split, lanes) };
  }
  return out;
}

/**
 * Ordena e garante 1 tempo entre notas seguidas na mesma faixa (muda para a faixa ao lado).
 * A última nota (a tónica final) nunca é tocada por este afastamento: se ela colidir com a
 * anterior, é a anterior que muda de faixa, para uma diferente da sua própria antecessora e
 * da faixa da final (para não voltar a colidir com nenhuma das duas); sem faixa livre (só com
 * 2 faixas), é a anterior que sai.
 */
export function spaceLanes<T extends Onset>(ns: T[], lanes: number): T[] {
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
    // `n` é a nota final: mantém-se; muda-se `prev` para uma faixa livre ou, sem nenhuma
    // (2 faixas), tira-se `prev`
    const before = k >= 2 ? out[k - 2].lane : -1;
    let lane = -1;
    for (let l = 0; l < lanes; l++)
      if (l !== before && l !== n.lane) {
        lane = l;
        break;
      }
    if (lane < 0) {
      out.splice(k - 1, 1);
      break;
    }
    out[k - 1] = { ...prev, lane };
  }
  return out;
}

function backing(
  bars: number,
  d: Difficulty,
  prog: number[],
  drums: DrumStyle,
  bassLine: BassLine,
  kit: string,
): BackingEvent[] {
  const ev: BackingEvent[] = [];
  const drum = (step: number, slot: number, vel: number) =>
    ev.push({ step, kind: 'drum', slot, vel });
  countIn(drum);
  const hatEvery = d === 'easy' ? BEAT : 2;
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * BAR;
    const degree = prog[bar % prog.length];
    if (bar === bars - 1) {
      finalBar(ev, base, kit);
      continue;
    }
    if (drums === 'straight') {
      for (let s = 0; s < BAR; s += hatEvery) drum(base + s, DRUM_SLOT.hat, 0.45);
      drum(base, DRUM_SLOT.kick, 0.9);
      drum(base + 8, DRUM_SLOT.kick, 0.8);
      drum(base + 4, DRUM_SLOT.snare, 0.7);
      drum(base + 12, DRUM_SLOT.snare, 0.7);
    } else if (drums === 'swing') {
      for (let s = 0; s < BAR; s += 2) drum(base + s, DRUM_SLOT.hat, 0.35);
      drum(base, DRUM_SLOT.kick, 0.85);
      drum(base + 10, DRUM_SLOT.kick, 0.7);
      drum(base + 4, DRUM_SLOT.snare, 0.6);
      drum(base + 12, DRUM_SLOT.snare, 0.6);
    } else {
      for (const s of [0, 4, 8, 12]) drum(base + s, DRUM_SLOT.kick, 0.95);
      drum(base + 4, DRUM_SLOT.clap, 0.7);
      drum(base + 12, DRUM_SLOT.clap, 0.7);
      for (const s of [2, 6, 10, 14]) drum(base + s, DRUM_SLOT.openHat, 0.4);
    }
    if (bassLine === 'eighths') {
      for (const s of [0, 2, 8, 10])
        ev.push({ step: base + s, kind: 'bass', degree, dur: 2, vel: 0.7 });
    } else if (bassLine === 'walk') {
      // caminhada em semínimas: I, III, V e de volta ao III do acorde (`degreeToMidi` sobe a
      // oitava se o grau passar o tamanho da escala, por isso não há limite aqui)
      [0, 2, 4, 2].forEach((add, k) =>
        ev.push({ step: base + k * 4, kind: 'bass', degree: degree + add, dur: 4, vel: 0.65 }));
    } else {
      for (const s of [2, 6, 10, 14]) ev.push({ step: base + s, kind: 'bass', degree, dur: 2, vel: 0.7 });
    }
  }
  return sortStable(ev);
}

type DrumFn = (step: number, slot: number, vel: number) => void;

/** Entrada: choques nos 4 tempos do compasso antes do início. */
function countIn(drum: DrumFn): void {
  for (let b = 0; b < 4; b++) drum(-COUNT_IN_STEPS + b * BEAT, DRUM_SLOT.hat, 0.6);
}

/** Último compasso: bombo, a pancada final do kit e a tónica no baixo. */
function finalBar(ev: BackingEvent[], base: number, kit: string): void {
  ev.push({ step: base, kind: 'drum', slot: DRUM_SLOT.kick, vel: 0.9 });
  ev.push({ step: base, kind: 'drum', slot: crashSlotFor(kit), vel: 0.6 });
  // a tónica (grau 0), para a música terminar resolvida em vez de ficar no V
  ev.push({ step: base, kind: 'bass', degree: 0, dur: BAR, vel: 0.7 });
}

/** Ordenação estável por passo: no mesmo passo fica a ordem de inserção. */
const sortStable = (ev: BackingEvent[]): BackingEvent[] =>
  ev
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.step - b.e.step || a.i - b.i)
    .map((x) => x.e);

/**
 * Acompanhamento de uma música escrita: em cada compasso, o padrão de bateria (verso ou
 * refrão), o baixo escrito e o tapete com a tríade do acorde; a entrada e o último compasso
 * são os de sempre.
 */
function songBacking(song: Song, bars: number, kit: string): BackingEvent[] {
  const ev: BackingEvent[] = [];
  countIn((step, slot, vel) => ev.push({ step, kind: 'drum', slot, vel }));
  for (let bar = 0; bar < bars; bar++) {
    const base = bar * BAR;
    if (bar === bars - 1) {
      finalBar(ev, base, kit);
      continue;
    }
    const sb = bar % song.bars;
    const hits = song.drums.chorusBars.includes(sb) ? song.drums.chorus : song.drums.verse;
    for (const h of hits) ev.push({ step: base + h.step, kind: 'drum', slot: h.slot, vel: h.vel });
    for (const b of song.bass)
      if (Math.floor(b.step / BAR) === sb)
        ev.push({ step: base + b.step - sb * BAR, kind: 'bass', degree: b.degree, dur: b.dur, vel: SONG_BASS_VEL });
    const c = song.chords[sb];
    ev.push({ step: base, kind: 'pad', degrees: [c, c + 2, c + 4], dur: BAR, vel: PAD_VEL });
  }
  return sortStable(ev);
}
