// Sons guardados (as predefinições): tocar numa carrega-a logo; a que coincide com o som atual
// fica marcada. "+ Guardar" pede um nome ali mesmo; os sons do utilizador apagam-se com ✕ e um
// segundo toque (sem confirm()).
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { completePreset, FACTORY_PRESETS, pickSound, presetMatches } from '../../state/presets';
import { useT } from '../../i18n';
import { presetLabel } from '../../i18n/data';
import { getState, useStore } from '../../state/store';
import { IconClose, IconPlus } from '../icons/UiIcons';
import p from '../panels/panels.module.css';
import s from './SoundPresets.module.css';

/** Tempo durante o qual o ✕ espera pelo segundo toque. */
const CONFIRM_MS = 3000;

export function SoundPresets() {
  // re-render quando o som muda, para marcar o preset que coincide
  const st = useStore(
    useShallow((x) => ({ ...pickSound(x), userPresets: x.userPresets, set: x.set })),
  );
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const tr = useT().presets;
  useEffect(() => {
    if (naming) input.current?.focus();
  }, [naming]);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [confirm]);

  const all = { ...FACTORY_PRESETS, ...st.userPresets };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (n in FACTORY_PRESETS) {
      setMsg(tr.factoryName);
      return;
    }
    st.set({ userPresets: { ...st.userPresets, [n]: pickSound(getState()) } });
    setName('');
    setNaming(false);
    setMsg(tr.saved(n));
  };
  const remove = (n: string) => {
    if (confirm !== n) {
      setConfirm(n);
      return;
    }
    const rest = { ...st.userPresets };
    delete rest[n];
    st.set({ userPresets: rest });
    setConfirm(null);
    setMsg(tr.deleted(n));
  };

  return (
    <section className={p.section} aria-labelledby="presets-t" data-testid="presets">
      <h3 className={p.label} id="presets-t">
        {tr.title}
        <button
          type="button"
          className={s.add}
          aria-expanded={naming}
          onClick={() => setNaming((x) => !x)}
          data-testid="preset-add"
        >
          <IconPlus width={14} height={14} /> {tr.add}
        </button>
      </h3>
      {naming && (
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            ref={input}
            className={s.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              e.stopPropagation();
              setNaming(false);
            }}
            placeholder={tr.namePlaceholder}
            aria-label={tr.nameAria}
            maxLength={40}
            data-testid="preset-name"
          />
          <button type="submit" className={p.btn} disabled={!name.trim()}>
            {tr.save}
          </button>
        </form>
      )}
      <div className={p.pillRow} role="group" aria-label="Sons guardados">
        {Object.entries(all).map(([n, pr]) => {
          const mine = n in st.userPresets;
          return (
            <span key={n} className={s.item}>
              <button
                type="button"
                className={p.pill}
                aria-pressed={presetMatches(st, pr)}
                onClick={() => {
                  st.set(completePreset(pr));
                  setMsg('');
                }}
                data-testid={`preset-${n}`}
              >
                {presetLabel(n)}
              </button>
              {mine && (
                <button
                  type="button"
                  className={s.del}
                  data-confirm={confirm === n || undefined}
                  aria-label={confirm === n ? tr.confirmDel(n) : tr.del(n)}
                  title={confirm === n ? tr.confirmShort : tr.del(n)}
                  onClick={() => remove(n)}
                >
                  {confirm === n ? tr.confirmShort : <IconClose width={12} height={12} />}
                </button>
              )}
            </span>
          );
        })}
      </div>
      <p className={p.hint} aria-live="polite">
        {msg || tr.hint}
      </p>
    </section>
  );
}
