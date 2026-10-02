// Os níveis do modo de jogo (`src/game/levels.ts`) ficam fora de `src/game` (que não importa
// áudio): este teste confirma que cada estilo aponta para instrumentos, kits e escalas reais, e
// que os sons que o gerador usa (`src/game/generator.ts`) existem de facto nesse kit.
import { describe, expect, it } from 'vitest';
import { crashSlotFor, DRUM_SLOT, generateChart } from '../game/generator';
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

describe('o acompanhamento de cada nível usa sons que existem (e fazem sentido) no seu kit', () => {
  /** Nome (em minúsculas) que se espera encontrar no `label` do kit, para os slots comuns. */
  const COMMON_LABEL: Partial<Record<number, string>> = {
    [DRUM_SLOT.kick]: 'bombo',
    [DRUM_SLOT.snare]: 'tarola',
    [DRUM_SLOT.hat]: 'choques',
    [DRUM_SLOT.openHat]: 'aberto',
    [DRUM_SLOT.clap]: 'palmas',
  };

  it('bombo, tarola, choques, prato aberto e palmas têm o nome esperado no kit do nível', () => {
    for (const lvl of LEVELS) {
      const kit = DRUMS[lvl.style.kit];
      const c = generateChart({
        difficulty: lvl.difficulty,
        seed: lvl.seed,
        scaleSize: SCALES[lvl.style.scale].length,
        lanes: 4,
        split: 2,
        bars: lvl.bars,
        bpm: lvl.bpm,
        drums: lvl.style.drums,
        bassLine: lvl.style.bassLine,
        swing: lvl.style.swing,
        kit: lvl.style.kit,
      });
      for (const e of c.backing) {
        if (e.kind !== 'drum') continue;
        const expected = COMMON_LABEL[e.slot];
        if (!expected) continue; // a pancada final (crashSlotFor) é verificada à parte
        expect(kit.labels[e.slot].toLowerCase()).toContain(expected);
      }
    }
  });

  it('a pancada final (crashSlotFor) usa um som que existe e faz sentido no kit do nível', () => {
    // o acústico tem um crash dedicado; o tr808 não, por isso devia usar o prato aberto (e não,
    // por exemplo, o slot 9 desse kit, que no tr808 são as maracas, não um crash)
    const FINAL_HIT_LABEL: Partial<Record<string, string>> = { drums: 'crash', tr808: 'aberto' };
    for (const lvl of LEVELS) {
      const kit = DRUMS[lvl.style.kit];
      const slot = crashSlotFor(lvl.style.kit);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(kit.labels.length);
      const expected = FINAL_HIT_LABEL[lvl.style.kit];
      if (expected) expect(kit.labels[slot].toLowerCase()).toContain(expected);
    }
  });
});
