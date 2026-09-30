// Desenho de cada forma de tocar: um ponto por nota, da mais grave (em baixo) à mais aguda.
import type { SVGProps } from 'react';
import type { ChordMode } from '../../audio/theory';

/** Pontos [x, y] numa grelha de 22×22. Na Quinta a altura segue os meios-tons (0, 7, 12). */
const DOTS: Record<ChordMode, [number, number][]> = {
  off: [[11, 11]],
  power: [
    [11, 18],
    [11, 9.8],
    [11, 4],
  ],
  triad: [
    [5, 18],
    [11, 11],
    [17, 4],
  ],
  seventh: [
    [3.5, 18.5],
    [8.5, 13.5],
    [13.5, 8.5],
    [18.5, 3.5],
  ],
};

export function ChordGlyph({ mode, ...rest }: { mode: ChordMode } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 22 22" width={22} height={22} fill="currentColor" aria-hidden {...rest}>
      {DOTS[mode].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={2.4} />
      ))}
    </svg>
  );
}
