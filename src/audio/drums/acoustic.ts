import type { DrumKit } from './types';

export const acoustic: DrumKit = {
  id: 'drums',
  name: 'Bateria',
  desc: 'Um instrumento por dedo.',
  labels: [
    'Bombo',
    'Tarola',
    'Choques',
    'Prato aberto',
    'Palmas',
    'Timbalão',
    'Tom grave',
    'Tom agudo',
    'Cowbell',
    'Crash',
  ],
  sounds: [
    (d) => d.tone(150, 42, 0.5, 1),
    (d) => {
      d.tone(220, 160, 0.15, 0.5, 'triangle');
      d.noise(0.2, 'highpass', 1500, 1, 0.6);
    },
    (d) => d.noise(0.06, 'highpass', 7000, 1, 0.45),
    (d) => d.noise(0.45, 'highpass', 6000, 1, 0.35),
    (d) => d.clap(),
    (d) => d.tone(90, 55, 0.6, 0.9),
    (d) => d.tone(130, 80, 0.4, 0.8),
    (d) => d.tone(200, 130, 0.3, 0.7),
    (d) => {
      d.tone(800, 800, 0.25, 0.3, 'square');
      d.tone(540, 540, 0.25, 0.3, 'square');
    },
    (d) => {
      d.noise(1.4, 'highpass', 4000, 0.7, 0.5);
      d.noise(0.8, 'bandpass', 9000, 1, 0.3);
    },
  ],
};
