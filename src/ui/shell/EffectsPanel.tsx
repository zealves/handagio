// Tab Efeitos: o efeito da boca primeiro (é a assinatura da app), depois os 5 knobs e "Repor
// efeitos" (com um segundo toque a confirmar).
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { useStore } from '../../state/store';
import p from '../panels/panels.module.css';
import { EFFECTS } from './effects';
import { effectDefaults } from './logic';
import s from './shell.module.css';

/** Ordem dos knobs: os do espaço e do timbre primeiro, a transposição no fim. */
const KNOBS = ['reverb', 'echo', 'filter', 'drive', 'pitch'];
const CONFIRM_MS = 3000;
const byId = (id: string) => EFFECTS.find((e) => e.id === id)!;

export function EffectsPanel() {
  const set = useStore((st) => st.set);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirm]);
  const Mouth = byId('mouth').Control;
  const tr = useT().fx;
  return (
    <div className={s.effects} data-testid="effects">
      <section className={p.section} aria-labelledby="fx-mouth-t">
        <h3 className={p.label} id="fx-mouth-t">
          {tr.mouthTitle}
        </h3>
        <Mouth />
      </section>
      <section className={p.section} aria-labelledby="fx-t">
        <h3 className={p.label} id="fx-t">
          {tr.title}
        </h3>
        <div className={s.knobs}>
          {KNOBS.map((id) => {
            const { Control } = byId(id);
            return (
              <div key={id} className={s.knob} title={tr.knobs[id as keyof typeof tr.knobs].desc}>
                <Control size={56} testId={`knob-${id}`} />
              </div>
            );
          })}
        </div>
        <div className={p.rowEnd}>
          <button
            type="button"
            className={p.btn}
            aria-pressed={confirm}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              set(effectDefaults());
              setConfirm(false);
            }}
            data-testid="fx-reset"
          >
            {confirm ? tr.resetConfirm : tr.reset}
          </button>
        </div>
      </section>
    </div>
  );
}
