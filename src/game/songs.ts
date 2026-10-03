// Modo de jogo: músicas escritas à mão (níveis 2 e 3). Puro, sem áudio: graus da escala a partir
// da tónica, passos em semicolcheias (16 por compasso). O gerador (`generator.ts`) mapeia a
// melodia para as faixas do jogador e tira daqui o baixo, a bateria e o tapete de acordes.

/** Passos por compasso (semicolcheias). */
export const SONG_BAR = 16;
/** Grau mais alto da melodia (a oitava da tónica): a melodia usa os graus 0..7, um por faixa. */
export const SONG_TOP_DEGREE = 7;

export interface SongNote {
  /** Passo dentro da música (16 por compasso). */
  step: number;
  /** Grau da escala a partir da tónica (na melodia, 0..7). */
  degree: number;
  /** Duração em passos. */
  dur: number;
}

export interface DrumHit {
  /** Passo dentro do compasso (0..15). */
  step: number;
  /** Slot do kit (`DRUM_SLOT` em `generator.ts`). */
  slot: number;
  vel: number;
}

export interface Song {
  /** Compassos da música; a ronda toca-a duas vezes. */
  bars: number;
  melody: SongNote[];
  /** Grau da fundamental do acorde, um por compasso. */
  chords: number[];
  /** Linha de baixo escrita (graus; a sessão toca-a uma oitava abaixo da melodia). */
  bass: SongNote[];
  /** Dois compassos-padrão; `chorusBars` diz que compassos usam o refrão. */
  drums: { verse: DrumHit[]; chorus: DrumHit[]; chorusBars: number[] };
}

/** Uma nota escrita dentro do compasso: [passo, grau, duração]. */
type N = readonly [step: number, degree: number, dur: number];

/** Junta compassos escritos (passos dentro do compasso) numa linha com passos da música. */
const fromBars = (bars: readonly (readonly N[])[]): SongNote[] =>
  bars.flatMap((bar, b) => bar.map(([step, degree, dur]) => ({ step: b * SONG_BAR + step, degree, dur })));

/** Baixo em semínimas: quatro graus por compasso. */
const quarters = (bars: readonly (readonly number[])[]): SongNote[] =>
  fromBars(bars.map((bar) => bar.map((degree, k): N => [k * 4, degree, 4])));

// Slots comuns aos kits do jogo (iguais a `DRUM_SLOT`, repetidos para `songs.ts` não depender
// do gerador).
const KICK = 0;
const SNARE = 1;
const HAT = 2;
const OPEN_HAT = 3;
const CLAP = 4;

const EIGHTHS = [0, 2, 4, 6, 8, 10, 12, 14];
const OFFBEATS = [2, 6, 10, 14];

// ---------------------------------------------------------------------------------------------
// NOITE: Ré dórico, vibrafone, 90 BPM, calmo e jazzy.
// Graus: 0 Ré, 1 Mi, 2 Fá, 3 Sol, 4 Lá, 5 Si (a 6.ª maior, a cor dórica), 6 Dó, 7 Ré agudo.
// Mão esquerda nas faixas 0–3 (Ré–Sol), direita nas 4–7 (Lá–Ré): as colcheias saltam sempre
// entre o Sol e o Lá (ou mais), para cada par cair numa mão diferente.
// ---------------------------------------------------------------------------------------------
const NIGHT_MELODY: N[][] = [
  // A (compassos 1–4), a pergunta: sobe pelo acorde, suspira no Si dórico e para no v
  [[0, 0, 4], [4, 2, 4], [8, 4, 8]], //            Dm  | Ré Fá Lá——
  [[0, 5, 6], [6, 4, 2], [8, 3, 8]], //            G   | Si. Lá Sol——
  [[0, 2, 4], [4, 3, 2], [6, 4, 2], [8, 2, 4], [12, 1, 4]], // Dm | Fá Sol-Lá Fá Mi
  [[0, 4, 12]], //                                  Am  | Lá——— (respira)
  // A' (5–8), a resposta: o mesmo começo, desce do Ré agudo e resolve na tónica
  [[0, 0, 4], [4, 2, 4], [8, 4, 8]], //            Dm  | Ré Fá Lá——
  [[0, 7, 6], [6, 5, 2], [8, 3, 8]], //            G   | Ré'. Si Sol——
  [[0, 6, 4], [4, 4, 4], [8, 3, 8]], //            C   | Dó Lá Sol——
  [[0, 2, 4], [4, 1, 4], [8, 0, 8]], //            Dm  | Fá Mi Ré——
  // B (9–12), a ponte: sobe para o registo agudo e demora-se no Si dórico sobre o Sol
  [[0, 4, 8], [8, 6, 4], [12, 7, 4]], //           F   | Lá—— Dó Ré'
  [[0, 6, 8], [8, 5, 6], [14, 3, 2]], //           C   | Dó—— Si. Sol
  [[0, 5, 8], [8, 7, 4], [12, 6, 4]], //           G   | Si—— Ré' Dó
  [[0, 5, 4], [4, 4, 12]], //                       Am  | Si Lá——— (respira)
  // A' (13–16), o fecho: o começo outra vez e a cadência Lá Sol Mi Ré
  [[0, 0, 4], [4, 2, 4], [8, 4, 8]], //            Dm  | Ré Fá Lá——
  [[0, 7, 6], [6, 5, 2], [8, 3, 8]], //            G   | Ré'. Si Sol——
  [[0, 4, 8], [8, 3, 4], [12, 1, 4]], //           Am  | Lá—— Sol Mi
  [[0, 0, 16]], //                                  Dm  | Ré————
];

export const NIGHT: Song = {
  bars: 16,
  melody: fromBars(NIGHT_MELODY),
  // i–IV–i–v | i–IV–VII–i | III–VII–IV–v | i–IV–v–i
  chords: [0, 3, 0, 4, 0, 3, 6, 0, 2, 6, 3, 4, 0, 3, 4, 0],
  // contrabaixo a andar em semínimas pelas notas do acorde, com uma nota de passagem para o
  // acorde seguinte no 4.º tempo
  bass: [
    ...quarters([
      [0, 2, 4, 2], [3, 5, 4, 1], [0, 2, 4, 3], [4, 3, 2, 1], // A
      [0, 2, 4, 2], [3, 2, 1, 0], [-1, 1, 3, 1], [0, 4, 3, 1], // A'
      [2, 4, 2, 0], [-1, 1, 3, 2], [3, 0, 1, 3], [4, 3, 2, 1], // B
      [0, 2, 4, 2], [3, 2, 1, 3], [4, 3, 2, 1], // A'
    ]),
    // último compasso: a tónica e o Lá grave a puxar de volta para o início
    { step: 15 * SONG_BAR, degree: 0, dur: 8 },
    { step: 15 * SONG_BAR + 8, degree: -3, dur: 8 },
  ],
  drums: {
    // suave: bombo no 1 e no "e" do 3, tarola em 2 e 4, choques em colcheias
    verse: [
      { step: 0, slot: KICK, vel: 0.7 },
      { step: 10, slot: KICK, vel: 0.55 },
      { step: 4, slot: SNARE, vel: 0.5 },
      { step: 12, slot: SNARE, vel: 0.5 },
      ...EIGHTHS.map((step) => ({ step, slot: HAT, vel: 0.3 })),
    ],
    // na ponte, um pouco mais de corpo e o prato aberto a fechar cada compasso
    chorus: [
      { step: 0, slot: KICK, vel: 0.75 },
      { step: 10, slot: KICK, vel: 0.6 },
      { step: 4, slot: SNARE, vel: 0.55 },
      { step: 12, slot: SNARE, vel: 0.55 },
      ...EIGHTHS.filter((s) => s !== 14).map((step) => ({ step, slot: HAT, vel: 0.35 })),
      { step: 14, slot: OPEN_HAT, vel: 0.3 },
    ],
    chorusBars: [8, 9, 10, 11],
  },
};

// ---------------------------------------------------------------------------------------------
// NÉON: Lá menor, pluck, 112 BPM, para dançar.
// Graus: 0 Lá, 1 Si, 2 Dó, 3 Ré, 4 Mi, 5 Fá, 6 Sol, 7 Lá agudo.
// Mão esquerda nas faixas 0–3 (Lá–Ré), direita nas 4–7 (Mi–Lá): cada par de colcheias cruza a
// divisória, e a nota a seguir ao par volta à mão de onde o par saiu.
// ---------------------------------------------------------------------------------------------
/** O gancho: par de colcheias, Ré sincopado no "e" do 2 e a descida para o Dó. */
const HOOK: N[] = [[0, 0, 2], [2, 4, 2], [6, 3, 2], [8, 4, 4], [12, 2, 4]]; // Lá Mi · Ré Mi— Dó—
/** A segunda metade do gancho: pontuada e uma nota longa para respirar. */
const HOOK_ANSWER: N[] = [[0, 5, 6], [6, 4, 2], [8, 2, 8]]; //                Fá. Mi Dó———

const NEON_MELODY: N[][] = [
  // A (compassos 1–4): o gancho de 2 compassos e a repetição, que fica em aberto no Ré
  HOOK, //                                          Am | Lá Mi · Ré Mi— Dó—
  HOOK_ANSWER, //                                   F  | Fá. Mi Dó———
  HOOK, //                                          C  | Lá Mi · Ré Mi— Dó—
  [[0, 6, 6], [6, 4, 2], [8, 3, 8]], //            G  | Sol. Mi Ré———
  // A' (5–8): o gancho outra vez; a resposta sobe ao Sol para lançar a ponte
  HOOK, //                                          Am
  HOOK_ANSWER, //                                   F
  [[0, 2, 2], [2, 6, 2], [6, 3, 2], [8, 4, 8]], // C  | Dó Sol · Ré Mi———
  [[0, 3, 4], [4, 1, 4], [8, 6, 8]], //            G  | Ré Si Sol———
  // B (9–12): o mesmo desenho a subir um grau por compasso até ao Lá agudo
  [[0, 0, 2], [2, 5, 2], [6, 2, 2], [8, 5, 8]], // F  | Lá Fá · Dó Fá———
  [[0, 1, 2], [2, 6, 2], [6, 3, 2], [8, 6, 8]], // G  | Si Sol · Ré Sol———
  [[0, 2, 2], [2, 7, 6], [8, 6, 2], [10, 3, 2], [12, 4, 4]], // Am | Dó Lá'. Sol Ré Mi
  [[0, 6, 6], [6, 4, 2], [8, 3, 8]], //            G  | Sol. Mi Ré——— (de volta ao gancho)
  // A' (13–16): o gancho e a cadência VII–i, do Sol para o Lá agudo
  HOOK, //                                          Am
  HOOK_ANSWER, //                                   F
  [[0, 3, 2], [2, 6, 2], [6, 1, 2], [8, 6, 8]], // G  | Ré Sol · Si Sol———
  [[0, 7, 16]], //                                  Am | Lá'————
];

/** Fundamental de cada acorde no baixo (graus, perto do Lá): Fá e Sol abaixo, o Dó mais grave. */
const NEON_BASS_ROOT: Readonly<Record<number, number>> = { 0: 0, 5: -2, 2: -5, 6: -1 };
const NEON_CHORDS = [0, 5, 2, 6, 0, 5, 2, 6, 5, 6, 0, 6, 0, 5, 6, 0];
/** Compassos da ponte: o baixo passa a oitavas em colcheias e a bateria ganha semicolcheias. */
const NEON_CHORUS = [8, 9, 10, 11];
const OCTAVE = 7;

export const NEON: Song = {
  bars: 16,
  melody: fromBars(NEON_MELODY),
  // i–VI–III–VII nas três primeiras frases (na ponte, VI–VII–i–VII); o fecho é i–VI–VII–i
  chords: NEON_CHORDS,
  // nos A, colcheias nos contratempos (o "bombear" do house); na ponte, oitavas em colcheias
  bass: fromBars(
    NEON_CHORDS.map((c, bar): N[] => {
      const r = NEON_BASS_ROOT[c];
      return NEON_CHORUS.includes(bar)
        ? EIGHTHS.map((s, k): N => [s, k % 2 ? r + OCTAVE : r, 2])
        : OFFBEATS.map((s): N => [s, r, 2]);
    }),
  ),
  drums: {
    // 808: bombo nos 4 tempos, palmas em 2 e 4, prato aberto nos contratempos
    verse: [
      ...[0, 4, 8, 12].map((step) => ({ step, slot: KICK, vel: 0.95 })),
      { step: 4, slot: CLAP, vel: 0.7 },
      { step: 12, slot: CLAP, vel: 0.7 },
      ...OFFBEATS.map((step) => ({ step, slot: OPEN_HAT, vel: 0.4 })),
    ],
    // refrão: o mesmo, com choques suaves nas semicolcheias que o prato aberto não ocupa
    chorus: [
      ...[0, 4, 8, 12].map((step) => ({ step, slot: KICK, vel: 0.95 })),
      { step: 4, slot: CLAP, vel: 0.7 },
      { step: 12, slot: CLAP, vel: 0.7 },
      ...OFFBEATS.map((step) => ({ step, slot: OPEN_HAT, vel: 0.4 })),
      ...Array.from({ length: SONG_BAR }, (_, s) => s)
        .filter((s) => !OFFBEATS.includes(s))
        .map((step) => ({ step, slot: HAT, vel: 0.2 })),
    ],
    chorusBars: NEON_CHORUS,
  },
};
