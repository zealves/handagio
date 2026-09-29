// Ícones SVG próprios dos instrumentos (traço 1.6 px numa grelha de 32, herdam currentColor).
import type { ReactNode } from 'react';

const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 32 32"
    width="34"
    height="34"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {children}
  </svg>
);

const keyboard = (
  <>
    <rect x="3" y="8" width="26" height="16" rx="2" />
    <path d="M8.2 8v16M13.4 8v16M18.6 8v16M23.8 8v16" />
    <path
      d="M6.5 8v8h3.4V8M11.7 8v8h3.4V8M22.1 8v8h3.4V8"
      fill="currentColor"
      stroke="none"
      opacity=".85"
    />
  </>
);

export const INSTRUMENT_ICONS: Record<string, ReactNode> = {
  piano: svg(keyboard),
  epiano: svg(
    <>
      <rect x="3" y="11" width="26" height="12" rx="2" />
      <path d="M7 17v6M11 17v6M15 17v6M19 17v6M23 17v6" />
      <circle cx="7" cy="14" r="1" />
      <circle cx="11" cy="14" r="1" />
      <path d="M17 14h8M8 23l-2 5M24 23l2 5" />
    </>,
  ),
  organ: svg(
    <>
      <path d="M5 28V14M9 28V9M13 28V5M17 28V5M21 28V9M25 28V14" />
      <path d="M5 14a1 1 0 0 1 0 0M3 28h26" />
      <path d="M13 5h4M9 9h0M21 9h0" />
    </>,
  ),
  harpsichord: svg(
    <>
      <path d="M4 20h24l-3-10C20 10 12 5 6 5L4 20z" />
      <path d="M4 20v4h24v-4M7 24v4M25 24v4M8 20V9M12 20V8M16 20v-9M20 20v-7" />
    </>,
  ),
  musicbox: svg(
    <>
      <rect x="5" y="14" width="22" height="13" rx="2" />
      <path d="M5 14l3-6h16l3 6M16 19v4M13 21h6" />
      <path d="M27 18h3v5" />
    </>,
  ),
  pluck: svg(
    <>
      <circle cx="11" cy="22" r="6.5" />
      <circle cx="11" cy="22" r="2" />
      <path d="M15 17.5 25 7.5M23 5.5l4 4M24.5 4l3.5 3.5" />
      <path d="M8 26l6-8" />
    </>,
  ),
  harp: svg(
    <>
      <path d="M8 28V5c6 0 9 4 11 8s4 7 8 8v2c-4 1-7 3-9 5H8z" />
      <path d="M11 8v18M14 9v17M17 12v14M20 16v10M23 20v5" />
    </>,
  ),
  violin: svg(
    <>
      <path d="M16 3v6M14 4h4" />
      <path d="M13 9h6c0 2-2 3-2 5s4 2 4 7-3 8-5 8-5-3-5-8 4-5 4-7-2-3-2-5z" />
      <path d="M14.5 18.5c.5 1 .5 2 0 3M17.5 18.5c-.5 1-.5 2 0 3M16 9v14" />
      <path d="M4 26 26 8" opacity=".7" />
    </>,
  ),
  cello: svg(
    <>
      <path d="M16 2v6" />
      <path d="M12 8h8c0 2-2 3-2 5s5 2 5 8-4 8-7 8-7-2-7-8 5-6 5-8-2-3-2-5z" />
      <path d="M16 8v16M14 17c.6 1 .6 2 0 3M18 17c-.6 1-.6 2 0 3M16 29v2" />
    </>,
  ),
  bass: svg(
    <>
      <path d="M6 26c-2-2-1-5 1-6l4-2c1-.5 1.5-2 2.5-3l9-9 3 3-9 9c-1 1-2.5 1.5-3 2.5l-2 4c-1 2-4 3-6 1.5z" />
      <path d="M22.5 6 26 2.5M25 9l3.5-3.5M9 21l3 3M11 19l3 3" />
    </>,
  ),
  flute: svg(
    <>
      <path d="M3 22 26 5l3 3L6 25z" />
      <circle cx="10" cy="19" r=".9" fill="currentColor" />
      <circle cx="13.5" cy="16.5" r=".9" fill="currentColor" />
      <circle cx="17" cy="14" r=".9" fill="currentColor" />
      <circle cx="20.5" cy="11.5" r=".9" fill="currentColor" />
    </>,
  ),
  brass: svg(
    <>
      <path d="M3 14h4v4H3zM7 15h12M7 17h12" />
      <path d="M19 12l9-6v20l-9-6z" />
      <path d="M11 15v-4h2v4M14 15v-4h2v4M11 11c0-3 5-3 5 0" />
    </>,
  ),
  choir: svg(
    <>
      <circle cx="10" cy="11" r="3.5" />
      <circle cx="22" cy="11" r="3.5" />
      <path d="M3 27c0-5 3-8 7-8s7 3 7 8M15 27c0-5 3-8 7-8s7 3 7 8" />
      <path d="M16 4c1 1 1 3 0 4M27 3c1.5 1.5 1.5 4 0 5.5" opacity=".7" />
    </>,
  ),
  sax: svg(
    <>
      <path d="M19 3l2 2-2 2v12c0 5-3 9-7 9s-6-3-6-6c0-2 2-3 4-3" />
      <path d="M10 17c0 3 2 4 4 4" />
      <circle cx="19" cy="11" r=".9" fill="currentColor" />
      <circle cx="19" cy="15" r=".9" fill="currentColor" />
      <path d="M21 5l5-2" />
    </>,
  ),
  marimba: svg(
    <>
      <path d="M4 9h5v10H4zM11 9h4v8h-4zM17 9h4v6h-4zM23 9h4v4h-4z" />
      <path d="M3 22h26M6 22v6M26 22v6" />
    </>,
  ),
  vibes: svg(
    <>
      <path d="M3 8h26M3 14h26" />
      <path d="M5 8v6M10 8v6M15 8v6M20 8v6M25 8v6" />
      <path d="M6 14v10M11 14v6M16 14v8M21 14v5M26 14v7" opacity=".75" />
      <path d="M4 28h24" />
    </>,
  ),
  kalimba: svg(
    <>
      <path d="M6 6h20l-2 22H8z" />
      <circle cx="16" cy="21" r="3" />
      <path d="M10 6v9M13 6v11M16 6v12M19 6v11M22 6v9" />
    </>,
  ),
  bell: svg(
    <>
      <path d="M16 3v3M9 22c0-2 1-3 1-8a6 6 0 0 1 12 0c0 5 1 6 1 8z" />
      <path d="M7 22h18M14 25a2 2 0 0 0 4 0" />
      <path d="M26 9c1.5 1 2.5 3 2.5 5M6 9c-1.5 1-2.5 3-2.5 5" opacity=".7" />
    </>,
  ),
  steel: svg(
    <>
      <ellipse cx="16" cy="11" rx="12" ry="5" />
      <path d="M4 11v9c0 3 5 5 12 5s12-2 12-5v-9" />
      <path d="M12 10.5c0-1.5 2-2.5 4-2.5s4 1 4 2.5-2 2-4 2-4-.5-4-2zM6.5 11c1 1 2.5 1.8 4 2" />
    </>,
  ),
  glass: svg(
    <>
      <path d="M9 4h14l-1.5 10a5.5 5.5 0 0 1-11 0z" />
      <path d="M16 19.5V27M11 28h10" />
      <path d="M10 8h12" opacity=".6" />
      <path d="M25 5c2 1 3 3 3 5M27 3c3 2 4 5 4 8" opacity=".7" />
    </>,
  ),
  synth: svg(
    <>
      <rect x="2" y="7" width="28" height="18" rx="2" />
      <path d="M2 17h28M6 17v8M10 17v8M14 17v8M18 17v8M22 17v8M26 17v8" />
      <circle cx="7" cy="12" r="1.8" />
      <circle cx="13" cy="12" r="1.8" />
      <path d="M18 10v4M22 11v2M26 9v5" />
    </>,
  ),
  pad: svg(
    <>
      <path d="M9 22a5 5 0 0 1-.5-10A7 7 0 0 1 22 10a5.5 5.5 0 0 1 1 11z" />
      <path d="M8 27c3-2 5-2 8 0s5 2 8 0" opacity=".75" />
    </>,
  ),
  chip: svg(
    <>
      <rect x="3" y="9" width="26" height="15" rx="6" />
      <path d="M9 14v5M6.5 16.5h5" />
      <rect x="19" y="13" width="2.5" height="2.5" fill="currentColor" stroke="none" />
      <rect x="23" y="16.5" width="2.5" height="2.5" fill="currentColor" stroke="none" />
    </>,
  ),
  wobble: svg(
    <>
      <path d="M2 16c2-8 4-8 6 0s4 8 6 0 4-8 6 0 4 8 6 0 3-5 4-2" />
      <path d="M4 26h24" opacity=".6" />
    </>,
  ),
  laser: svg(
    <>
      <path d="M3 20l6-2 2 4-6 2zM11 19l18-11" />
      <path d="M22 16l6-2M20 22l7 1" opacity=".7" />
      <circle cx="29" cy="8" r="1.4" fill="currentColor" />
    </>,
  ),
  theremin: svg(
    <>
      <rect x="4" y="18" width="20" height="7" rx="1.5" />
      <path d="M20 18V4M24 21h2c2 0 3-1 3-3v-3M9 25v4M19 25v4" />
      <path d="M11 13c1.5-1.5 3.5-1.5 5 0M9 10c3-3 7-3 10 0" opacity=".75" />
    </>,
  ),
  drums: svg(
    <>
      <ellipse cx="16" cy="12" rx="10" ry="3.5" />
      <path d="M6 12v9c0 2 4.5 3.5 10 3.5s10-1.5 10-3.5v-9" />
      <path d="M6 14l5 9M26 14l-5 9M16 15.5v9" opacity=".7" />
      <path d="M9 3l5 7M24 3l-5 7" />
    </>,
  ),
  tr808: svg(
    <>
      <rect x="2" y="7" width="28" height="18" rx="2" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="13" cy="12" r="2" />
      <path d="M18 11h8" />
      <rect x="5" y="18" width="3.4" height="4" rx=".6" />
      <rect x="10.6" y="18" width="3.4" height="4" rx=".6" fill="currentColor" />
      <rect x="16.2" y="18" width="3.4" height="4" rx=".6" />
      <rect x="21.8" y="18" width="3.4" height="4" rx=".6" fill="currentColor" />
    </>,
  ),
  latin: svg(
    <>
      <path d="M7 6h8l-1 22H8z" />
      <ellipse cx="11" cy="6" rx="4" ry="1.5" />
      <path d="M18 10h8l-1 18h-6z" />
      <ellipse cx="22" cy="10" rx="4" ry="1.5" />
      <path d="M7.5 14h7M18.5 17h7" opacity=".7" />
    </>,
  ),
};

export const instrumentIcon = (id: string): ReactNode =>
  INSTRUMENT_ICONS[id] ?? INSTRUMENT_ICONS.piano;
