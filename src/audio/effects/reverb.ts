// Reverb por convolução com resposta a impulso gerada (ruído com decaimento).

export function makeIR(ctx: BaseAudioContext, secs: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

/** Envio de reverb: from → send → convolver → to. */
export function createReverb(ctx: BaseAudioContext, from: AudioNode, to: AudioNode) {
  const conv = ctx.createConvolver();
  conv.buffer = makeIR(ctx, 2.8, 2.3);
  const send = ctx.createGain();
  send.gain.value = 0;
  from.connect(send);
  send.connect(conv);
  conv.connect(to);
  return {
    /** amount 0..1 → envio = amount × 0.9 (valor do protótipo) */
    set(amount: number, t: number) {
      send.gain.setTargetAtTime(amount * 0.9, t, 0.05);
    },
  };
}
