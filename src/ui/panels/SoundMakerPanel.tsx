import { useId, useRef, useState } from 'react';
import { NOTE_NAMES, SCALE_NAMES, type ScaleName } from '../../audio/theory';
import { useShallow } from 'zustand/react/shallow';
import { useStore } from '../../state/store';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import { useCanvas } from '../frame';
import { IconChevron } from '../icons/UiIcons';
import { drawBars, NEON_GRAD, spectrumBars } from './draw';
import { Panel } from './Panel';
import s from './panels.module.css';

export function SoundMakerPanel() {
  const st = useStore(
    useShallow((x) => ({
      root: x.root,
      scale: x.scale,
      octave: x.octave,
      heightPitch: x.heightPitch,
      glide: x.glide,
      thumbs: x.thumbs,
      sensitivity: x.sensitivity,
      set: x.set,
    })),
  );
  const [open, setOpen] = useState(false);
  const id = useId();
  const vals = useRef(new Float32Array(40));
  const cv = useCanvas((g, w, h, now) =>
    drawBars(g, w, h, spectrumBars(40, vals.current), NEON_GRAD, now),
  );
  return (
    <Panel title="Sound Maker">
      <canvas ref={cv} className={s.canvas} role="img" aria-label="Espectro do som em tempo real" />
      <button
        type="button"
        className={s.row}
        aria-expanded={open}
        aria-controls={`${id}-eng`}
        onClick={() => setOpen((o) => !o)}
        data-testid="engine-toggle"
      >
        <span>Motor de som</span>
        <IconChevron width={16} height={16} />
      </button>
      {open && (
        <div className={s.engine} id={`${id}-eng`}>
          <div className={s.fields}>
            <label className={s.field}>
              Tónica
              <select value={st.root} onChange={(e) => st.set({ root: +e.target.value })}>
                {NOTE_NAMES.map((n, i) => (
                  <option key={n} value={i}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              Escala
              <select
                value={st.scale}
                onChange={(e) => st.set({ scale: e.target.value as ScaleName })}
                data-testid="scale"
              >
                {SCALE_NAMES.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          <Slider
            label="Oitava base"
            min={1}
            max={6}
            value={st.octave}
            onChange={(v) => st.set({ octave: v })}
          />
          <Toggle
            label="Altura da mão muda o tom"
            checked={st.heightPitch}
            onChange={(v) => st.set({ heightPitch: v })}
          />
          <Toggle
            label="Deslizar o tom enquanto seguras"
            checked={st.glide}
            onChange={(v) => st.set({ glide: v })}
          />
          <Toggle
            label="Usar também os polegares"
            checked={st.thumbs}
            onChange={(v) => st.set({ thumbs: v })}
          />
        </div>
      )}
      <div style={{ paddingTop: 12 }}>
        <Slider
          label="Sensibilidade da visão"
          min={0}
          max={100}
          value={Math.round(st.sensitivity * 100)}
          onChange={(v) => st.set({ sensitivity: v / 100 })}
          format={(v) => `${v}%`}
        />
      </div>
    </Panel>
  );
}
