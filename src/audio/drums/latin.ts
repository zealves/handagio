import type { DrumKit } from './types';

export const latin: DrumKit = {
  id: 'latin',
  name: 'Latina',
  desc: 'Congas, bongós e companhia.',
  labels: [
    'Conga',
    'Conga alta',
    'Bongó',
    'Bongó alto',
    'Shaker',
    'Clave',
    'Agogô',
    'Güiro',
    'Timbale',
    'Triângulo',
  ],
  sounds: [
    (d) => d.tone(220, 190, 0.35, 0.8),
    (d) => d.tone(330, 300, 0.25, 0.8),
    (d) => d.tone(400, 370, 0.15, 0.8),
    (d) => d.tone(520, 490, 0.12, 0.8),
    (d) => {
      d.noise(0.08, 'highpass', 5000, 1, 0.3);
      d.noise(0.08, 'highpass', 6000, 1, 0.25, 0.09);
    },
    (d) => d.tone(2500, 2500, 0.06, 0.6),
    (d) => {
      d.tone(900, 900, 0.25, 0.3, 'triangle');
      d.tone(1350, 1350, 0.25, 0.15, 'triangle');
    },
    (d) => {
      for (let k = 0; k < 10; k++) d.noise(0.02, 'bandpass', 3500, 4, 0.4, k * 0.018);
    },
    (d) => {
      d.tone(700, 600, 0.4, 0.5, 'triangle');
      d.noise(0.3, 'bandpass', 3000, 1, 0.2);
    },
    (d) => {
      d.tone(3100, 3100, 1.4, 0.2);
      d.tone(4800, 4800, 1, 0.08);
    },
  ],
};
