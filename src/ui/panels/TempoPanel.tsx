import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import { STEPS_PER_BAR, STEPS_PER_BEAT } from '../../audio/metronome';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import type { Quantize } from '../../state/types';
import { useT } from '../../i18n';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import { useFrame } from '../frame';
import { Panel } from './Panel';
import s from './panels.module.css';

const QUANT: Quantize[] = ['off', '1/8', '1/16'];

export function TempoPanel() {
  const st = useStore(
    useShallow((x) => ({ bpm: x.bpm, metronome: x.metronome, quantize: x.quantize, set: x.set })),
  );
  const tr = useT().tempo;
  const dots = useRef<(HTMLElement | null)[]>([]);
  useFrame(() => {
    const beat = live.step < 0 ? -1 : Math.floor((live.step % STEPS_PER_BAR) / STEPS_PER_BEAT);
    dots.current.forEach((d, k) => {
      if (!d) return;
      if (k === beat) d.dataset.on = '1';
      else delete d.dataset.on;
    });
  });
  return (
    <Panel title={tr.title}>
      <Slider
        label={tr.title}
        min={60}
        max={180}
        value={st.bpm}
        onChange={(v) => st.set({ bpm: v })}
        format={(v) => `${v} BPM`}
      />
      <div className={s.tempoRow}>
        <button
          type="button"
          className={s.btn}
          onClick={() => session.tapTempo()}
          data-testid="tap"
        >
          {tr.tap}
        </button>
        <div className={s.beats} aria-hidden>
          {[0, 1, 2, 3].map((k) => (
            <i
              key={k}
              ref={(el) => void (dots.current[k] = el)}
              data-accent={k === 0 ? '' : undefined}
            />
          ))}
        </div>
      </div>
      <Toggle
        label={tr.metronome}
        checked={st.metronome}
        onChange={(v) => st.set({ metronome: v })}
        testId="metronome"
      />
      <div className={s.tempoRow} style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <span className={s.field} id="quant-l">
          {tr.quantize}
        </span>
        <div className={s.seg} role="radiogroup" aria-labelledby="quant-l">
          {QUANT.map((q) => (
            <button
              key={q}
              type="button"
              role="radio"
              aria-checked={st.quantize === q}
              onClick={() => st.set({ quantize: q })}
            >
              {q === 'off' ? tr.free : q}
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
