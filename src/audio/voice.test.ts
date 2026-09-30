import { describe, expect, it } from 'vitest';
import { PATCHES } from './patches';
import { fakeCtx, peakOf, type FakeParam } from './testing/fakeAudio';
import { PENDING_HOLD, playVoice, releaseOrCancel } from './voice';

/** Voz sintetizada (Lead, sustentada) agendada para 0,1 s; o 1.º ganho criado é o de saída. */
function pendingSynth() {
  const f = fakeCtx();
  const deps = { ctx: f.ctx, noise: {} as AudioBuffer, ks: () => ({}) as AudioBuffer };
  const voice = playVoice(deps, PATCHES.synth, {} as AudioNode, 440, 1, 0, 0.1);
  const out = f.gains[0] as unknown as FakeParam;
  return { ...f, voice, out };
}

describe('vozes sintetizadas agendadas', () => {
  it('sem largar, soam', () => {
    const { out } = pendingSynth();
    expect(peakOf(out)).toBeGreaterThan(0.1);
  });
  it('largar tudo antes do início: a voz nunca chega a soar', () => {
    const { voice, out, clock } = pendingSynth();
    clock.currentTime = 0.03;
    releaseOrCancel(voice, clock.currentTime);
    expect(peakOf(out)).toBeLessThanOrEqual(1e-9);
  });
  it('o noteOff de um toque curto antes do início ainda soa (PENDING_HOLD)', () => {
    const { voice, out, clock } = pendingSynth();
    clock.currentTime = 0.03;
    voice.release();
    expect(peakOf(out)).toBeGreaterThan(0.1);
    // e cala-se depois do toque curto
    expect(out.at(0.1 + PENDING_HOLD + 2)).toBeLessThan(1e-3);
  });
  it('largar tudo depois do início larga normalmente, sem corte seco', () => {
    const { voice, out, clock } = pendingSynth();
    clock.currentTime = 0.3;
    const before = out.at(0.3);
    releaseOrCancel(voice, clock.currentTime);
    expect(before).toBeGreaterThan(0.05);
    // 10 ms depois ainda soa (libertação, não kill)
    expect(out.at(0.31)).toBeGreaterThan(before * 0.5);
  });
});
