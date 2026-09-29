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
});
