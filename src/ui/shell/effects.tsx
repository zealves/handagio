// Registo dos efeitos globais: cada entrada tem o seu controlo, usado na tab Efeitos. Um efeito
// novo = uma entrada aqui + o nó correspondente em src/audio.
import { useId, useRef, type ComponentType, type KeyboardEvent } from 'react';
import { live } from '../../state/live';
import { DEFAULT_SOUND, useStore, type SoundSettings } from '../../state/store';
import { MOUTH_FX, type MouthFxId } from '../../state/types';
import { Knob } from '../controls/Knob';
import { useFrame } from '../frame';
import p from '../panels/panels.module.css';
import { t, useT } from '../../i18n';
import { mouthText } from '../../i18n/data';
import { keyTarget } from './logic';

export interface ControlProps {
  size?: number;
  testId?: string;
}

/** Os nomes e as explicações estão nas línguas (`fx.knobs`, `data.mouth`). */
export interface EffectDef {
  id: string;
  Control: ComponentType<ControlProps>;
}

type KnobKey = 'reverb' | 'echo' | 'pitch' | 'filter' | 'drive';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const semis = (v: number) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`);

function storeKnob(
  k: KnobKey,
  o: { min: number; max: number; step?: number; format: (v: number) => string },
) {
  function EffectKnob({ size, testId }: ControlProps) {
    const label = useT().fx.knobs[k].label;
    const value = useStore((st) => st[k]);
    const set = useStore((st) => st.set);
    return (
      <Knob
        label={label}
        value={value}
        min={o.min}
        max={o.max}
        step={o.step}
        defaultValue={(DEFAULT_SOUND as SoundSettings)[k]}
        onChange={(v) => set({ [k]: v })}
        format={o.format}
        size={size}
        testId={testId}
      />
    );
  }
  return EffectKnob;
}

// eslint-disable-next-line react-refresh/only-export-components -- ficheiro é um registo de dados (EFFECTS), não um módulo de componentes
function MouthControl({ testId = 'mouth-fx' }: ControlProps) {
  const mouthFx = useStore((st) => st.mouthFx);
  const set = useStore((st) => st.set);
  const id = useId();
  const bar = useRef<HTMLElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  const opts = useRef<(HTMLButtonElement | null)[]>([]);
  const all = useT();
  const tr = all.fx;
  const space = all.start.space;
  useFrame(() => {
    if (bar.current) bar.current.style.width = `${live.mouth * 100}%`;
    if (txt.current) {
      const face = useStore.getState().faceState;
      txt.current.textContent =
        face === 'unavailable' && !live.spaceHeld
          ? t().fx.meter.unavailable
          : face === 'waiting' && !live.spaceHeld && live.mouth < 0.02
            ? t().fx.meter.waiting
            : live.mouth > 0.08
              ? `${Math.round(live.mouth * 100)}%`
              : t().fx.meter.closed;
    }
  });
  const k = MOUTH_FX.findIndex((m) => m.id === mouthFx);
  const desc = mouthText(mouthFx).desc;
  // radiogroup: as setas escolhem logo (o Espaço fica para a boca, decisão 14)
  const onKey = (e: KeyboardEvent) => {
    const next = keyTarget(e.key, k, MOUTH_FX.length);
    if (next === null) return;
    e.preventDefault();
    set({ mouthFx: MOUTH_FX[next].id });
    opts.current[next]?.focus();
  };
  return (
    <div>
      <div
        className={p.pillWrap}
        role="radiogroup"
        aria-label={tr.mouthLabel}
        aria-describedby={`${id}-md`}
        onKeyDown={onKey}
        data-testid={testId}
      >
        {MOUTH_FX.map((m, i) => (
          <button
            key={m.id}
            ref={(el) => {
              opts.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={mouthFx === m.id}
            tabIndex={mouthFx === m.id ? 0 : -1}
            className={p.pill}
            onClick={() => set({ mouthFx: m.id as MouthFxId })}
            data-testid={`mouth-${m.id}`}
          >
            {mouthText(m.id).label}
          </button>
        ))}
      </div>
      <div className={p.meter}>
        <span>{tr.mouth}</span>
        <div className={p.bar} role="presentation">
          <i ref={bar} />
        </div>
        <span ref={txt} className={p.meterTxt} aria-live="off">
          {tr.meter.waiting}
        </span>
      </div>
      <p id={`${id}-md`} className={p.hint}>
        {desc}. {tr.hintOpen} <kbd>{space}</kbd> {tr.hintSimulate}
      </p>
    </div>
  );
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'reverb',
    Control: storeKnob('reverb', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'echo',
    Control: storeKnob('echo', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'pitch',
    Control: storeKnob('pitch', { min: -12, max: 12, step: 1, format: semis }),
  },
  {
    id: 'filter',
    Control: storeKnob('filter', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'drive',
    Control: storeKnob('drive', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'mouth',
    Control: MouthControl,
  },
];
