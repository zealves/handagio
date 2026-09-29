import { useId, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { live } from '../../state/live';
import { DEFAULT_SOUND, useStore } from '../../state/store';
import { MOUTH_FX, type MouthFxId } from '../../state/types';
import { Knob } from '../controls/Knob';
import { useFrame } from '../frame';
import { Panel } from './Panel';
import s from './panels.module.css';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const semis = (v: number) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`);

export function EffectsPanel() {
  const st = useStore(
    useShallow((x) => ({
      reverb: x.reverb,
      echo: x.echo,
      pitch: x.pitch,
      filter: x.filter,
      drive: x.drive,
      mouthFx: x.mouthFx,
      faceState: x.faceState,
      set: x.set,
    })),
  );
  const [page, setPage] = useState(0);
  const id = useId();
  const bar = useRef<HTMLElement>(null);
  const txt = useRef<HTMLSpanElement>(null);

  useFrame(() => {
    if (bar.current) bar.current.style.width = `${live.mouth * 100}%`;
    if (txt.current) {
      const face = useStore.getState().faceState;
      txt.current.textContent =
        face === 'unavailable' && !live.spaceHeld
          ? 'indisponível'
          : face === 'waiting' && !live.spaceHeld && live.mouth < 0.02
            ? 'à espera'
            : live.mouth > 0.08
              ? `${Math.round(live.mouth * 100)}%`
              : 'fechada';
    }
  });

  return (
    <Panel title="Efeitos">
      <div
        role="tabpanel"
        id={`${id}-p${page}`}
        aria-label={page === 0 ? 'Página 1: espaço e tom' : 'Página 2: cor e boca'}
      >
        {page === 0 ? (
          <div className={s.knobs}>
            <Knob
              label="Reverb"
              value={st.reverb}
              min={0}
              max={1}
              defaultValue={DEFAULT_SOUND.reverb}
              onChange={(v) => st.set({ reverb: v })}
              format={pct}
              testId="knob-reverb"
            />
            <Knob
              label="Eco"
              value={st.echo}
              min={0}
              max={1}
              defaultValue={DEFAULT_SOUND.echo}
              onChange={(v) => st.set({ echo: v })}
              format={pct}
            />
            <Knob
              label="Pitch"
              value={st.pitch}
              min={-12}
              max={12}
              step={1}
              defaultValue={0}
              onChange={(v) => st.set({ pitch: v })}
              format={semis}
            />
          </div>
        ) : (
          <div className={s.knobs}>
            <Knob
              label="Filtro"
              value={st.filter}
              min={0}
              max={1}
              defaultValue={1}
              onChange={(v) => st.set({ filter: v })}
              format={pct}
            />
            <Knob
              label="Drive"
              value={st.drive}
              min={0}
              max={1}
              defaultValue={0}
              onChange={(v) => st.set({ drive: v })}
              format={pct}
            />
            <label className={s.mouthSel}>
              <select
                value={st.mouthFx}
                onChange={(e) => st.set({ mouthFx: e.target.value as MouthFxId })}
                aria-describedby={`${id}-md`}
                data-testid="mouth-fx"
              >
                {MOUTH_FX.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className={s.sub} style={{ margin: 0 }}>
                Efeito da boca
              </span>
            </label>
          </div>
        )}
      </div>
      <div className={s.dots} role="tablist" aria-label="Páginas de efeitos">
        {[0, 1].map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            className={s.dot}
            aria-selected={page === p}
            aria-controls={`${id}-p${p}`}
            aria-label={`Página ${p + 1} de 2`}
            onClick={() => setPage(p)}
          />
        ))}
      </div>
      <div className={s.meter}>
        <span>Boca</span>
        <div className={s.bar} role="presentation">
          <i ref={bar} />
        </div>
        <span ref={txt} className={s.meterTxt} aria-live="off">
          à espera
        </span>
      </div>
      <p id={`${id}-md`} className={s.desc} style={{ minHeight: 0, marginTop: 6 }}>
        {MOUTH_FX.find((m) => m.id === st.mouthFx)?.desc}. Segura <kbd>Espaço</kbd> para simular.
      </p>
    </Panel>
  );
}
