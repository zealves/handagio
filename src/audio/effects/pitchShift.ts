// Pitch global: transposição em semitons aplicada às frequências das vozes, dos kits e do
// theremin. Transpor na origem mantém o som limpo (sem artefactos de um pitch-shifter em tempo
// real) e a latência a zero. Ver docs/DECISIONS.md.

export const pitchFactor = (semitones: number): number => Math.pow(2, semitones / 12);
