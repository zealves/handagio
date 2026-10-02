// Os níveis do modo de jogo (`src/game/levels.ts`) ficam fora de `src/game` (que não importa
// áudio): este teste confirma que cada estilo aponta para instrumentos, kits e escalas reais.
import { describe, expect, it } from 'vitest';
import { LEVELS } from '../game/levels';
import { DRUMS } from './drums';
import { instrumentInfo } from './instruments';
import { SCALES } from './theory';

describe('estilos dos níveis', () => {
  it('a melodia e o baixo são instrumentos melódicos conhecidos', () => {
    for (const { style } of LEVELS) {
      expect(instrumentInfo(style.melody).id).toBe(style.melody);
      expect(instrumentInfo(style.melody).kind).not.toBe('drum');
      expect(instrumentInfo(style.bass).id).toBe(style.bass);
      expect(instrumentInfo(style.bass).kind).not.toBe('drum');
    }
  });

  it('o kit existe em DRUMS', () => {
    for (const { style } of LEVELS) expect(DRUMS[style.kit]).toBeDefined();
  });

  it('a escala existe em SCALES', () => {
    for (const { style } of LEVELS) expect(SCALES[style.scale]).toBeDefined();
  });
});
