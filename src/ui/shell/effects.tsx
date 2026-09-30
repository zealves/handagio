// Registo dos efeitos globais: cada entrada tem o seu controlo, usado na gaveta Efeitos e no
// rodapé por baixo do palco (em modo compacto). Um efeito novo = uma entrada aqui + o nó
// correspondente em src/audio.
import { useId, useRef, type ComponentType } from 'react';
import { live } from '../../state/live';
import { DEFAULT_SOUND, useStore, type SoundSettings } from '../../state/store';
import { MOUTH_FX, type MouthFxId } from '../../state/types';
import { Knob } from '../controls/Knob';
import { useFrame } from '../frame';
import p from '../panels/panels.module.css';

/** `compact`: versão pequena do rodapé (sem a explicação; o valor só com o rato ou o foco). */
export interface ControlProps {
  size?: number;
  testId?: string;
  compact?: boolean;
}

export interface EffectDef {
  id: string;
  label: string;
  desc: string;
  Control: ComponentType<ControlProps>;
}

type KnobKey = 'reverb' | 'echo' | 'pitch' | 'filter' | 'drive';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const semis = (v: number) => (v === 0 ? '0 st' : `${v > 0 ? '+' : ''}${v} st`);

function storeKnob(
  k: KnobKey,
  label: string,
  o: { min: number; max: number; step?: number; format: (v: number) => string },
) {
  function EffectKnob({ size, testId, compact }: ControlProps) {
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
        compact={compact}
      />
    );
  }
  return EffectKnob;
}

// eslint-disable-next-line react-refresh/only-export-components -- ficheiro é um registo de dados (EFFECTS), não um módulo de componentes
function MouthControl({ testId = 'mouth-fx', compact }: ControlProps) {
  const mouthFx = useStore((st) => st.mouthFx);
  const set = useStore((st) => st.set);
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
  const desc = MOUTH_FX.find((m) => m.id === mouthFx)?.desc;
  const select = (
    <select
      value={mouthFx}
      onChange={(e) => set({ mouthFx: e.target.value as MouthFxId })}
      aria-describedby={`${id}-md`}
      data-testid={testId}
    >
      {MOUTH_FX.map((m) => (
        <option key={m.id} value={m.id}>
          {m.label}
        </option>
      ))}
    </select>
  );
  if (compact)
    return (
      <div className={p.mouthMini}>
        <label className={p.mouthMiniSel} title="Efeito da boca: abre a boca para o aplicar">
          <span className="sr-only">Efeito da boca</span>
          {select}
        </label>
        <div className={p.mouthMiniMeter}>
          <span aria-hidden>Boca</span>
          <div className={p.bar} role="presentation">
            <i ref={bar} />
          </div>
        </div>
        <span id={`${id}-md`} className="sr-only">
          {desc}. Segura Espaço para simular.
        </span>
      </div>
    );
  return (
    <div>
      <label className={p.mouthSel}>
        {select}
        <span className={p.sub} style={{ margin: 0 }}>
          Efeito da boca
        </span>
      </label>
      <div className={p.meter}>
        <span>Boca</span>
        <div className={p.bar} role="presentation">
          <i ref={bar} />
        </div>
        <span ref={txt} className={p.meterTxt} aria-live="off">
          à espera
        </span>
      </div>
      <p id={`${id}-md`} className={p.desc} style={{ minHeight: 0, marginTop: 6 }}>
        {desc}. Segura <kbd>Espaço</kbd> para simular.
      </p>
    </div>
  );
}

export const EFFECTS: EffectDef[] = [
  {
    id: 'reverb',
    label: 'Reverb',
    desc: 'Espaço à volta do som',
    Control: storeKnob('reverb', 'Reverb', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'echo',
    label: 'Eco',
    desc: 'Delay: repetições do som',
    Control: storeKnob('echo', 'Eco', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'pitch',
    label: 'Pitch',
    desc: 'Transpõe tudo em semitons',
    Control: storeKnob('pitch', 'Pitch', { min: -12, max: 12, step: 1, format: semis }),
  },
  {
    id: 'filter',
    label: 'Filtro',
    desc: 'Fecha para abafar o som',
    Control: storeKnob('filter', 'Filtro', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'drive',
    label: 'Drive',
    desc: 'Saturação quente',
    Control: storeKnob('drive', 'Drive', { min: 0, max: 1, format: pct }),
  },
  {
    id: 'mouth',
    label: 'Boca',
    desc: 'Abre a boca para aplicar',
    Control: MouthControl,
  },
];
