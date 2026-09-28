// Eco (delay com realimentação filtrada), envio a partir do post.

export function createDelay(ctx: BaseAudioContext, from: AudioNode, to: AudioNode) {
  const dly = ctx.createDelay(1.5);
  dly.delayTime.value = 0.32;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  const send = ctx.createGain();
  send.gain.value = 0;
  from.connect(send);
  send.connect(dly);
  dly.connect(lp);
  lp.connect(fb);
  fb.connect(dly);
  lp.connect(to);
  return {
    /** amount 0..1 → envio = amount × 0.6 (valor do protótipo) */
    set(amount: number, t: number) {
      send.gain.setTargetAtTime(amount * 0.6, t, 0.05);
    },
    /** Sincroniza o tempo do eco com o metrónomo (colcheia com ponto). */
    setTime(secs: number, t: number) {
      dly.delayTime.setTargetAtTime(Math.min(1.4, secs), t, 0.1);
    },
  };
}
