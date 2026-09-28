// Tipos e funções auxiliares dos kits de percussão (portados de playDrum()).

export interface DrumTools {
  tone(
    f0: number,
    f1: number,
    dur: number,
    peak: number,
    type?: OscillatorType,
    delay?: number,
  ): void;
  noise(
    dur: number,
    type: BiquadFilterType,
    fq: number,
    q: number,
    peak: number,
    delay?: number,
  ): void;
  clap(): void;
}

export interface DrumKit {
  id: string;
  name: string;
  desc: string;
  labels: string[]; // 10 sons; com 8 dedos usam-se os 8 primeiros
  sounds: ((d: DrumTools) => void)[];
}

/** Constrói as ferramentas de um disparo. `pitch` multiplica as frequências (knob Pitch). */
export function drumTools(
  ctx: BaseAudioContext,
  t: number,
  out: AudioNode,
  noiseBuf: AudioBuffer,
  v: number,
  pitch = 1,
  track: (n: AudioNode) => void = () => {},
): DrumTools {
  const noise: DrumTools['noise'] = (dur, type, fq, q, peak, delay = 0) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = fq * pitch;
    f.Q.value = q || 1;
    const g = ctx.createGain();
    s.connect(f);
    f.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(peak * v, t + delay + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    s.start(t + delay);
    s.stop(t + delay + dur + 0.05);
    [s, f, g].forEach(track);
  };
  const tone: DrumTools['tone'] = (f0, f1, dur, peak, type = 'sine', delay = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0 * pitch, t + delay);
    o.frequency.exponentialRampToValueAtTime(f1 * pitch, t + delay + dur);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(peak * v, t + delay + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g);
    g.connect(out);
    o.start(t + delay);
    o.stop(t + delay + dur + 0.05);
    [o, g].forEach(track);
  };
  const clap = () =>
    [0, 0.012, 0.024, 0.036].forEach((d) =>
      noise(d === 0.036 ? 0.18 : 0.03, 'bandpass', 1200, 1.5, 0.8, d),
    );
  return { tone, noise, clap };
}
