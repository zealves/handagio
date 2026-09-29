import { describe, expect, it } from 'vitest';
import { INSTRUMENT_BY_ID } from '../audio/instruments';
import { SCALES } from '../audio/theory';
import { completePreset, FACTORY_PRESETS, pickSound } from './presets';
import { DEFAULT_PREFS, DEFAULT_SOUND } from './store';

describe('presets', () => {
  it('4 presets de fábrica válidos', () => {
    expect(Object.keys(FACTORY_PRESETS)).toEqual([
      'Piano calmo',
      'Batida 808',
      'Theremin espacial',
      'Coro etéreo',
    ]);
    for (const p of Object.values(FACTORY_PRESETS)) {
      expect(INSTRUMENT_BY_ID[p.instrument]).toBeDefined();
      expect(SCALES[p.scale]).toBeDefined();
      expect(p.bpm).toBeGreaterThanOrEqual(60);
      expect(p.bpm).toBeLessThanOrEqual(180);
    }
  });
  it('pickSound só guarda os campos de som', () => {
    const s = pickSound({ ...DEFAULT_PREFS, instrument: 'harp' });
    expect(Object.keys(s).sort()).toEqual(Object.keys(DEFAULT_SOUND).sort());
    expect(s.instrument).toBe('harp');
  });
  it('completa presets antigos', () => {
    expect(completePreset({ instrument: 'pad' })).toEqual({ ...DEFAULT_SOUND, instrument: 'pad' });
  });
  it('as notas dos dedos entram nos presets', () => {
    const notes = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69];
    const s = pickSound({
      ...DEFAULT_PREFS,
      tonicAt: 'left-pinky',
      noteMode: 'custom',
      customNotes: notes,
    });
    expect(s).toMatchObject({ tonicAt: 'left-pinky', noteMode: 'custom', customNotes: notes });
    expect(completePreset(s)).toMatchObject({ noteMode: 'custom', customNotes: notes });
    // a sensibilidade dos polegares é da pessoa, não do som
    expect('thumbSensitivity' in s).toBe(false);
  });
  it('a Batida 808 mantém a Pentatónica, que vinha do antigo defeito', () => {
    expect(FACTORY_PRESETS['Batida 808'].scale).toBe('Pentatónica');
  });
  it('presets de fábrica usam os modos por defeito', () => {
    for (const p of Object.values(FACTORY_PRESETS)) {
      expect(p.noteMode).toBe('scale');
      expect(p.tonicAt).toBe(DEFAULT_SOUND.tonicAt);
      expect(p.customNotes).toEqual(DEFAULT_SOUND.customNotes);
    }
  });
  it('preset com notas estragadas fica com 10 notas válidas', () => {
    expect(completePreset({ customNotes: [61] }).customNotes).toEqual([
      61,
      ...DEFAULT_SOUND.customNotes.slice(1),
    ]);
  });
});
