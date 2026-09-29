// Lógica pura das amostras: nomes de notas, amostra mais próxima, velocidade de reprodução e
// momento de libertação (um toque curto ainda deixa ouvir o instrumento).
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export function noteToMidi(name: string): number {
  const m = /^([A-G])(s|#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nota inválida: ${name}`);
  const acc = m[2] === 's' || m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PC[m[1]] + acc;
}

export function nearestSample(midi: number, notes: number[]): number {
  let best = notes[0];
  for (const n of notes) {
    const d = Math.abs(n - midi);
    const bd = Math.abs(best - midi);
    if (d < bd || (d === bd && n < best)) best = n;
  }
  return best;
}

export const playbackRateFor = (targetMidi: number, sampleMidi: number): number =>
  Math.min(4, Math.max(0.25, Math.pow(2, (targetMidi - sampleMidi) / 12)));

export const releaseTime = (now: number, startAt: number, minHold = 0.25): number =>
  Math.max(now, startAt + minHold);
