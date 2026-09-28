// AnalyserNode partilhado pelos visualizadores, com buffers pré-alocados (sem lixo a 60 fps).

export class SharedAnalyser {
  readonly node: AnalyserNode;
  readonly freq: Uint8Array<ArrayBuffer>;
  readonly time: Uint8Array<ArrayBuffer>;
  readonly timeF: Float32Array<ArrayBuffer>;
  private lastFreq = -1;
  private lastTime = -1;

  constructor(ctx: BaseAudioContext) {
    this.node = ctx.createAnalyser();
    this.node.fftSize = 2048;
    this.node.smoothingTimeConstant = 0.78;
    this.freq = new Uint8Array(this.node.frequencyBinCount);
    this.time = new Uint8Array(this.node.fftSize);
    this.timeF = new Float32Array(this.node.fftSize);
  }

  /** Espectro (0..255); lido no máximo uma vez por fotograma, mesmo com vários painéis. */
  frequency(): Uint8Array<ArrayBuffer> {
    const f = Math.floor(performance.now() / 8);
    if (f !== this.lastFreq) {
      this.node.getByteFrequencyData(this.freq);
      this.lastFreq = f;
    }
    return this.freq;
  }

  waveform(): Float32Array<ArrayBuffer> {
    const f = Math.floor(performance.now() / 8);
    if (f !== this.lastTime) {
      this.node.getFloatTimeDomainData(this.timeF);
      this.lastTime = f;
    }
    return this.timeF;
  }

  /** Nível RMS atual (0..1). */
  level(): number {
    const w = this.waveform();
    let s = 0;
    for (let i = 0; i < w.length; i += 4) s += w[i] * w[i];
    return Math.sqrt(s / (w.length / 4));
  }
}
