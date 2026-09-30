// Desenho de cada forma de tocar: um ponto por nota, da mais grave (em baixo) à mais aguda.
import type { SVGProps } from 'react';
import type { ChordMode } from '../../audio/theory';

interface Glyph {
  /** Pontos [x, y] numa grelha de 22×22. */
  dots: [number, number][];
  /** Raio dos pontos (por defeito 2,4). */
  r?: number;
  /** Setinha (arpejo: as notas soam uma a uma, a subir). */
  arrow?: boolean;
}

/**
 * Na Oitava e na Quinta a altura segue os meios-tons (0, 12 e 0, 7, 12). No Suspenso a 4.ª fica
 * mais perto da 5.ª do que a 3.ª do Acorde; a Nona é a escada da Sétima com mais um degrau.
 */
const GLYPHS: Record<ChordMode, Glyph> = {
  off: { dots: [[11, 11]] },
  octave: {
    dots: [
      [11, 18.5],
      [11, 3.5],
    ],
  },
  power: {
    dots: [
      [11, 18],
      [11, 9.8],
      [11, 4],
    ],
  },
  triad: {
    dots: [
      [5, 18],
      [11, 11],
      [17, 4],
    ],
  },
  sus4: {
    dots: [
      [5, 18],
      [11, 6.5],
      [17, 3.5],
    ],
  },
  seventh: {
    dots: [
      [3.5, 18.5],
      [8.5, 13.5],
      [13.5, 8.5],
      [18.5, 3.5],
    ],
  },
  ninth: {
    r: 2,
    dots: [
      [3, 19],
      [7, 15],
      [11, 11],
      [15, 7],
      [19, 3],
    ],
  },
  arp: {
    r: 1.8,
    arrow: true,
    dots: [
      [3.5, 18.5],
      [8, 14],
      [12.5, 9.5],
    ],
  },
};

export function ChordGlyph({ mode, ...rest }: { mode: ChordMode } & SVGProps<SVGSVGElement>) {
  const g = GLYPHS[mode];
  return (
    <svg viewBox="0 0 22 22" width={22} height={22} fill="currentColor" aria-hidden {...rest}>
      {g.dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={g.r ?? 2.4} />
      ))}
      {g.arrow && (
        <path
          d="M15.5 6.5 L19.5 2.5 M15 2.5 H19.5 V7"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
