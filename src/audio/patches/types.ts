// Tipos partilhados pelos patches melódicos.

export type Family = 'Teclas' | 'Cordas' | 'Sopros' | 'Lâminas' | 'Sintetizadores' | 'Percussão';
export const FAMILIES: Family[] = [
  'Teclas',
  'Cordas',
  'Sopros',
  'Lâminas',
  'Sintetizadores',
  'Percussão',
];

/** "Kit" de funções auxiliares entregue a cada patch (igual ao do protótipo). */
export interface Kit {
  ctx: BaseAudioContext;
  t: number;
  out: GainNode;
  osc(
    type: OscillatorType,
    f: number,
    dest: AudioNode | AudioParam,
    detune?: number,
  ): OscillatorNode;
  gain(v: number, dest: AudioNode | AudioParam): GainNode;
  filt(type: BiquadFilterType, f: number, q: number, dest: AudioNode): BiquadFilterNode;
  noise(dest: AudioNode, loop?: boolean): AudioBufferSourceNode;
  buffer(buf: AudioBuffer, dest: AudioNode): AudioBufferSourceNode;
  /** Envelope de percussão: ataque rápido e decaimento exponencial. */
  hit(param: AudioParam, peak: number, a: number, dec: number): void;
  /** Envelope sustentado. */
  adsr(param: AudioParam, peak: number, a: number, d: number, s: number): void;
  lfo(rate: number, depth: number, param: AudioParam): { o: OscillatorNode; g: GainNode };
  /** Buffer Karplus-Strong (com cache). */
  ks(freq: number, damp: number, secs: number, bright: boolean): AudioBuffer;
  /** Nó criado à mão pelo patch (para ser desligado no fim). */
  track<N extends AudioNode>(n: N): N;
  /** Chamado quando a voz termina (limpar intervalos, etc.). */
  onStop?: () => void;
}

export type SetFreq = (fr: number) => void;

export interface Patch {
  id: string;
  name: string;
  family: Exclude<Family, 'Percussão'>;
  desc: string;
  /** Segura enquanto o dedo estiver dobrado. */
  sustain?: boolean;
  /** Tempo de libertação (constante de tempo). */
  rel?: number;
  /** Duração máxima de um one-shot, em segundos. */
  len?: number;
  /** Toca até ao fim, mesmo depois de soltar. */
  ring?: boolean;
  /** Contínuo (theremin): a dobra controla o volume. */
  continuous?: boolean;
  build?(K: Kit, f: number, vel: number, v: number): SetFreq | void;
}
