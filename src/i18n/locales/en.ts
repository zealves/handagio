// English. Must satisfy the Portuguese type: TypeScript lists any missing key.
import { EN_NAMING } from '../../audio/theory';
import type { Messages } from '../types';

const en = {
  /** Letter names: C, D, E… and "G7", "Dm", "Cmaj7". */
  naming: EN_NAMING,
  meta: {
    htmlLang: 'en',
    title: 'Handagio — Vision Sound Cam',
    description: 'Handagio: a musical instrument you play with your hands in front of the camera.',
  },
} satisfies Messages;

export default en;
