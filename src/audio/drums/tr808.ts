import type { DrumKit } from './types';

const METAL = [1, 1.34, 1.6, 1.9, 2.4, 2.9];

export const tr808: DrumKit = {
  id: 'tr808',
  name: 'Caixa 808',
  desc: 'Ritmos eletrónicos clássicos.',
  labels: [
    'Bombo 808',
    'Tarola',
    'Choques',
    'Aberto',
    'Palmas',
    'Tom',
    'Rimshot',
    'Cowbell',
    'Clave',
    'Maracas',
  ],
  sounds: [
    (d) => d.tone(60, 40, 1.2, 1),
    (d) => {
      d.tone(180, 180, 0.12, 0.4, 'triangle');
      d.tone(330, 330, 0.08, 0.3, 'triangle');
      d.noise(0.18, 'highpass', 2000, 1, 0.5);
    },
    (d) => METAL.forEach((r) => d.tone(400 * r, 400 * r, 0.05, 0.08, 'square')),
    (d) => METAL.forEach((r) => d.tone(400 * r, 400 * r, 0.35, 0.06, 'square')),
    (d) => d.clap(),
    (d) => d.tone(160, 110, 0.45, 0.8),
    (d) => {
      d.tone(1700, 1700, 0.02, 0.4, 'triangle');
      d.noise(0.02, 'bandpass', 2500, 3, 0.4);
    },
    (d) => {
      d.tone(540, 540, 0.3, 0.3, 'square');
      d.tone(800, 800, 0.3, 0.25, 'square');
    },
    (d) => d.tone(2500, 2500, 0.05, 0.5, 'sine'),
    (d) => d.noise(0.06, 'highpass', 5000, 1, 0.35),
  ],
};
