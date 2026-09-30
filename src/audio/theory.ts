// Teoria musical: escalas, graus, midi↔frequência e nomes das notas em português.
// Valores copiados do protótipo (reference/maos-musicais.html).

export const NOTE_NAMES = [
  'Dó',
  'Dó♯',
  'Ré',
  'Ré♯',
  'Mi',
  'Fá',
  'Fá♯',
  'Sol',
  'Sol♯',
  'Lá',
  'Lá♯',
  'Si',
] as const;

export const SCALES = {
  Maior: [0, 2, 4, 5, 7, 9, 11],
  'Maior harmónica': [0, 2, 4, 5, 7, 8, 11],
  Lídia: [0, 2, 4, 6, 7, 9, 11],
  Mixolídia: [0, 2, 4, 5, 7, 9, 10],
  Menor: [0, 2, 3, 5, 7, 8, 10],
  'Menor harmónica': [0, 2, 3, 5, 7, 8, 11],
  'Menor melódica': [0, 2, 3, 5, 7, 9, 11],
  Pentatónica: [0, 2, 4, 7, 9],
  'Pentatónica menor': [0, 3, 5, 7, 10],
  Blues: [0, 3, 5, 6, 7, 10],
  Dórica: [0, 2, 3, 5, 7, 9, 10],
  Frígia: [0, 1, 3, 5, 7, 8, 10],
  Árabe: [0, 1, 4, 5, 7, 8, 11],
  Japonesa: [0, 1, 5, 7, 8],
  'Tons inteiros': [0, 2, 4, 6, 8, 10],
  Cromática: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALES;
export const SCALE_NAMES = Object.keys(SCALES) as ScaleName[];

export interface Tuning {
  root: number; // 0..11 (Dó..Si)
  scale: ScaleName;
  octave: number; // 1..6
}

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** Grau da escala (pode ser negativo ou passar a oitava) → nota MIDI. */
export function degreeToMidi(d: number, t: Tuning): number {
  const sc = SCALES[t.scale];
  const n = sc.length;
  const o = Math.floor(d / n);
  const idx = ((d % n) + n) % n;
  return 12 * (t.octave + 1) + t.root + sc[idx] + 12 * o;
}

export const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);

export function noteName(m: number): string {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
}

/** Nome sem oitava ("Dó♯"). */
export function pitchClassName(m: number): string {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12];
}

export const scaleLength = (s: ScaleName): number => SCALES[s].length;

/** Grupos para a lista de escalas na interface. */
export const SCALE_GROUPS: { label: string; scales: ScaleName[] }[] = [
  { label: 'Maiores', scales: ['Maior', 'Maior harmónica', 'Lídia', 'Mixolídia'] },
  { label: 'Menores', scales: ['Menor', 'Menor harmónica', 'Menor melódica', 'Dórica', 'Frígia'] },
  { label: 'Pentatónicas', scales: ['Pentatónica', 'Pentatónica menor', 'Blues'] },
  { label: 'Outras', scales: ['Árabe', 'Japonesa', 'Tons inteiros', 'Cromática'] },
];

export type ChordMode = 'off' | 'octave' | 'power' | 'triad' | 'sus4' | 'seventh' | 'ninth';

/**
 * Formas de tocar, da mais simples à mais rica (é a ordem da coluna, do menu e da tecla C).
 * No modo Escala os acordes constroem-se sobre o grau de cada dedo, dentro da escala (acordes
 * diatónicos): tríade = graus +0 +2 +4; suspenso = +0 +3 +4; sétima = +0 +2 +4 +6; nona = +0 +2
 * +4 +6 +8. A oitava e a quinta (power chord) usam meios-tons fixos.
 */
export const CHORD_MODES: { id: ChordMode; label: string; desc: string }[] = [
  { id: 'off', label: 'Uma nota', desc: 'A melodia: cada dedo toca a sua nota.' },
  { id: 'octave', label: 'Oitava', desc: 'A nota e a mesma uma oitava acima: mais cheia.' },
  { id: 'power', label: 'Quinta', desc: 'Nota, quinta e oitava: o "power chord" do rock.' },
  { id: 'triad', label: 'Acorde', desc: '3 notas da escala; maior ou menor conforme o dedo.' },
  { id: 'sus4', label: 'Suspenso', desc: 'Aberto e sem maior nem menor (sus4).' },
  { id: 'seventh', label: 'Sétima', desc: '4 notas, com a 7.ª: jazz e blues.' },
  { id: 'ninth', label: 'Nona', desc: '5 notas, com a 7.ª e a 9.ª: rico, R&B.' },
];

const CHORD_IDS = new Set<string>(CHORD_MODES.map((m) => m.id));

/** Forma de tocar guardada (prefs, presets): um id desconhecido passa a "Uma nota". */
export const validChord = (v: unknown): ChordMode =>
  typeof v === 'string' && CHORD_IDS.has(v) ? (v as ChordMode) : 'off';

/** Graus da escala somados ao grau do dedo em cada acorde diatónico. */
const DEGREE_STEPS: Record<Exclude<ChordMode, 'octave' | 'power'>, number[]> = {
  off: [0],
  triad: [0, 2, 4],
  sus4: [0, 3, 4],
  seventh: [0, 2, 4, 6],
  ninth: [0, 2, 4, 6, 8],
};

/** Notas MIDI do acorde de um grau (a primeira é a fundamental). */
export function chordMidis(degree: number, t: Tuning, mode: ChordMode): number[] {
  const root = degreeToMidi(degree, t);
  if (mode === 'octave') return [root, root + 12];
  if (mode === 'power') return [root, root + 7, root + 12];
  return DEGREE_STEPS[mode].map((k) => degreeToMidi(degree + k, t));
}

/** Intervalos em meios-tons do modo Personalizado (sem escala). */
const CUSTOM_STEPS: Record<ChordMode, number[]> = {
  off: [0],
  octave: [0, 12],
  power: [0, 7, 12],
  triad: [0, 4, 7],
  sus4: [0, 5, 7],
  seventh: [0, 4, 7, 10],
  ninth: [0, 4, 7, 10, 14],
};

/**
 * Acorde sobre uma nota exata (modo Personalizado, sem escala): intervalos fixos em meios-tons.
 * Oitava, quinta (nota + quinta + oitava, como no modo Escala), tríade maior, sus4, sétima
 * dominante e nona dominante.
 */
export function customChord(midi: number, mode: ChordMode): number[] {
  return CUSTOM_STEPS[mode].map((k) => midi + k);
}

/** Nome da tríade ou da tétrade (sem a nona). */
function baseName(r: string, iv: number[]): string {
  const minor = iv[1] === 3;
  const dim = minor && iv[2] === 6;
  const aug = !minor && iv[2] === 8;
  if (iv[3] === undefined) return r + (dim ? ' dim' : aug ? ' aum' : minor ? ' m' : '');
  const s = iv[3];
  if (dim) return r + (s === 9 ? ' dim7' : ' m7♭5');
  if (minor) return r + (s === 11 ? ' m7M' : ' m7');
  return r + (aug ? ' aum' : '') + (s === 11 ? ' 7M' : ' 7');
}

/**
 * Nome curto de um acorde: fundamental + qualidade (ex.: "Ré m", "Sol 7", "Si m7♭5", "Dó sus4",
 * "Sol 9", "Dó 7M(9)"). A oitava é só a fundamental. `mode` distingue o suspenso, que pelos
 * intervalos se confundiria com as tríades das escalas pentatónicas.
 */
export function chordName(ms: number[], mode?: ChordMode): string {
  const r = pitchClassName(ms[0]);
  const iv = ms.map((m) => m - ms[0]);
  if (iv.length === 2 && iv[1] === 12) return r;
  if (iv[1] === 7) return `${r} 5`;
  if (mode === 'sus4') {
    const fourth = iv[1] === 6 ? 'sus♯4' : iv[1] === 4 ? 'sus♭4' : 'sus4';
    const fifth = iv[2] === 6 ? '♭5' : iv[2] === 8 ? '♯5' : '';
    return `${r} ${fourth}${fifth}`;
  }
  const base = baseName(r, iv);
  if (iv[4] === undefined) return base;
  // nona: "Sol 9" e "Ré m9" quando a 7.ª é menor e a 9.ª maior; senão junta-se a nona: "Dó 7M(9)"
  const ninth = iv[4] - 12;
  if (ninth === 2 && (base.endsWith(' 7') || base.endsWith(' m7'))) return base.slice(0, -1) + '9';
  return `${base}(${ninth === 1 ? '♭9' : ninth === 3 ? '♯9' : '9'})`;
}
