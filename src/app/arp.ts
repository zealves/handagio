// Arpejo (lógica pura, sem React nem áudio): as notas do acorde de um dedo, uma a uma, em cada
// semicolcheia do relógio, pelo padrão "sobe e desce".

/** Índices das notas do acorde, pela ordem em que soam: n0 n1 n2 n1, e volta ao início. */
export const ARP_PATTERN: readonly number[] = [0, 1, 2, 1];

/** Nos instrumentos sustentados, cada nota larga ao fim desta fração do passo. */
export const ARP_GATE = 0.9;

/**
 * Chaves de voz que cada dedo usa em rotação. Os passos são agendados até 100 ms antes de
 * soarem; com uma só chave, a nota seguinte largava a atual antes do tempo. Com três, a chave só
 * volta a ser usada depois de a sua nota ter largado, mesmo a 180 BPM (passos de 83 ms).
 */
export const ARP_KEYS = 3;

/** Nota `idx` do arpejo (o acorde tem de ter pelo menos uma nota). */
export function arpNote(notes: readonly number[], idx: number): number {
  const n = ARP_PATTERN.length;
  const p = ARP_PATTERN[((idx % n) + n) % n];
  return notes[Math.min(p, notes.length - 1)];
}

/**
 * O passo do relógio em `time` toca a nota seguinte de um arpejo que começou em `start`? Não se
 * for antes do disparo nem se cair em cima dele (menos de meio passo depois): com a quantização,
 * o disparo já é um passo, e sem ela um passo muito próximo soaria como duas notas juntas.
 */
export const arpStepDue = (start: number, time: number, stepDur: number): boolean =>
  time - start >= stepDur / 2;

/**
 * Passos do relógio já emitidos (agendados antes de soarem) em que um arpejo acabado de disparar
 * em `start` também deve tocar: os da grelha (`anchor` + k × `stepDur`) que cumprem `arpStepDue`
 * e ficam antes de `until` (o próximo passo por emitir, que chega pelo `onStep`). Sem isto, a
 * 2.ª nota esperava até dois passos.
 */
export function arpCatchUp(
  start: number,
  anchor: number,
  stepDur: number,
  until: number,
): number[] {
  const out: number[] = [];
  const k0 = Math.ceil((start + stepDur / 2 - anchor) / stepDur - 1e-9);
  for (let k = k0; ; k++) {
    const t = anchor + k * stepDur;
    if (t >= until - 1e-9) break;
    if (arpStepDue(start, t, stepDur)) out.push(t);
  }
  return out;
}
