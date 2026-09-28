// Filtro (passa-baixo global) e Drive (saturação em paralelo), página 2 dos efeitos.

export function createTone(ctx: BaseAudioContext, input: AudioNode, output: AudioNode) {
  const dryG = ctx.createGain();
  const pre = ctx.createGain();
  const ws = ctx.createWaveShaper();
  const wetG = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) c[i] = Math.tanh((i / 512 - 1) * 3);
  ws.curve = c;
  ws.oversample = '2x';
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = 20000;
  wetG.gain.value = 0;
  input.connect(dryG);
  input.connect(pre);
  pre.connect(ws);
  ws.connect(wetG);
  dryG.connect(lp);
  wetG.connect(lp);
  lp.connect(output);
  return {
    /** filter 0..1 (1 = aberto) → 180 Hz..20 kHz em escala logarítmica. */
    setFilter(v: number, t: number) {
      lp.frequency.setTargetAtTime(180 * Math.pow(110, v), t, 0.03);
    },
    /** drive 0..1 */
    setDrive(v: number, t: number) {
      pre.gain.setTargetAtTime(1 + v * 10, t, 0.03);
      wetG.gain.setTargetAtTime(v * 0.45, t, 0.03);
      dryG.gain.setTargetAtTime(1 - v * 0.6, t, 0.03);
    },
  };
}
