import { useEffect, useId, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import { completePreset, FACTORY_PRESETS, pickSound } from '../../state/presets';
import { DEFAULT_PREFS, getState, useStore } from '../../state/store';
import { IconButton } from '../controls/IconButton';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import { IconClose } from '../icons/UiIcons';
import p from './panels.module.css';
import s from './SettingsDialog.module.css';

export function SettingsDialog() {
  const st = useStore(
    useShallow((x) => ({
      open: x.settingsOpen,
      cameraId: x.cameraId,
      lowRes: x.lowRes,
      volume: x.volume,
      theme: x.theme,
      calibration: x.calibration,
      calibrating: x.calibrating,
      engine: x.engine,
      userPresets: x.userPresets,
      octave: x.octave,
      heightPitch: x.heightPitch,
      glide: x.glide,
      sensitivity: x.sensitivity,
      custom: x.noteMode === 'custom',
      set: x.set,
    })),
  );
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [cams, setCams] = useState<{ id: string; label: string }[]>([]);
  const [preset, setPreset] = useState('Piano calmo');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const d = ref.current!;
    if (st.open && !d.open) {
      d.showModal();
      void session.cameras().then(setCams);
    } else if (!st.open && d.open) d.close();
  }, [st.open]);

  const close = () => st.set({ settingsOpen: false });
  const all = { ...FACTORY_PRESETS, ...st.userPresets };
  const isUser = preset in st.userPresets;

  const load = () => {
    const pr = all[preset];
    if (!pr) return;
    st.set(completePreset(pr));
    setMsg(`Predefinição "${preset}" carregada.`);
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    if (n in FACTORY_PRESETS) {
      setMsg('Esse nome é de uma predefinição de fábrica. Escolhe outro.');
      return;
    }
    st.set({ userPresets: { ...st.userPresets, [n]: pickSound(getState()) } });
    setPreset(n);
    setName('');
    setMsg(`Predefinição "${n}" guardada.`);
  };
  const remove = () => {
    if (!isUser) return;
    const rest = { ...st.userPresets };
    delete rest[preset];
    st.set({ userPresets: rest });
    setPreset('Piano calmo');
    setMsg('Predefinição apagada.');
  };

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={`${id}-t`}
      onClose={close}
      onCancel={close}
      onClick={(e) => e.target === ref.current && close()}
      data-testid="settings"
    >
      <div className={s.head}>
        <h2 id={`${id}-t`}>Definições</h2>
        <IconButton small label="Fechar as definições" onClick={close}>
          <IconClose width={16} height={16} />
        </IconButton>
      </div>
      <div className={s.body}>
        <section className={s.section}>
          <h3>Predefinições</h3>
          <div className={s.row}>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
              aria-label="Predefinição"
              data-testid="preset-select"
            >
              <optgroup label="De fábrica">
                {Object.keys(FACTORY_PRESETS).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </optgroup>
              {Object.keys(st.userPresets).length > 0 && (
                <optgroup label="As minhas">
                  {Object.keys(st.userPresets).map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" className={p.btn} onClick={load} data-testid="preset-load">
              Carregar
            </button>
            {isUser && (
              <button type="button" className={p.btn} onClick={remove}>
                Apagar
              </button>
            )}
          </div>
          <div className={s.row}>
            <input
              className={s.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="Nome da predefinição"
              aria-label="Nome para guardar a predefinição atual"
              maxLength={40}
            />
            <button type="button" className={p.btn} onClick={save} disabled={!name.trim()}>
              Guardar atual
            </button>
          </div>
          <p className={s.hint} aria-live="polite">
            {msg ||
              'Guarda o instrumento, a escala, a tónica, a oitava, as notas dos dedos, os efeitos e o tempo.'}
          </p>
        </section>

        <section className={s.section}>
          <h3>Câmara</h3>
          <label className={p.field}>
            Câmara
            <select
              value={st.cameraId ?? ''}
              onChange={(e) => st.set({ cameraId: e.target.value || null })}
              disabled={cams.length < 2}
            >
              <option value="">Predefinida</option>
              {cams.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Toggle
            label="Baixar a resolução (computadores mais lentos)"
            checked={st.lowRes}
            onChange={(v) => st.set({ lowRes: v })}
          />
        </section>

        <section className={s.section}>
          <h3>Mãos</h3>
          <div className={s.row}>
            <button
              type="button"
              className={p.btn}
              onClick={() => {
                close();
                void session.calibrate();
              }}
              disabled={!!st.calibrating || st.engine !== 'hands'}
            >
              Calibrar mãos
            </button>
            <button
              type="button"
              className={p.btn}
              onClick={() => st.set({ calibration: null })}
              disabled={!st.calibration}
            >
              Repor calibração
            </button>
          </div>
          <p className={s.hint}>
            {st.engine !== 'hands'
              ? 'A calibração fica disponível quando a deteção das mãos estiver ligada.'
              : st.calibration
                ? 'Limiares calibrados para ti. Estica e dobra os dedos durante 3 s cada para recalibrar.'
                : 'Estica os dedos durante 3 s e depois dobra-os durante 3 s; os limiares ajustam-se à tua mão.'}
          </p>
        </section>

        <section className={s.section}>
          <h3>Tocar</h3>
          <Slider
            label="Oitava base"
            min={1}
            max={6}
            value={st.octave}
            onChange={(v) => st.set({ octave: v })}
          />
          <Slider
            label="Sensibilidade da visão"
            min={0}
            max={100}
            value={Math.round(st.sensitivity * 100)}
            onChange={(v) => st.set({ sensitivity: v / 100 })}
            format={(v) => `${v}%`}
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
          {st.custom && (
            <p className={s.hint}>
              Com as notas personalizadas, a altura da mão e o deslizar não mudam o tom.
            </p>
          )}
        </section>

        <section className={s.section}>
          <h3>Som e aspeto</h3>
          <Slider
            label="Volume geral"
            min={0}
            max={100}
            value={Math.round(st.volume * 100)}
            onChange={(v) => st.set({ volume: v / 100 })}
            format={(v) => `${v}%`}
          />
          <div className={s.row} style={{ justifyContent: 'space-between' }}>
            <span className={p.field} id={`${id}-th`}>
              Tema
            </span>
            <div className={p.seg} role="radiogroup" aria-labelledby={`${id}-th`}>
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={st.theme === t}
                  onClick={() => st.set({ theme: t })}
                >
                  {t === 'dark' ? 'Escuro' : 'Claro'}
                </button>
              ))}
            </div>
          </div>
          <div className={s.row}>
            <button
              type="button"
              className={p.btn}
              onClick={() => {
                const { userPresets } = getState();
                st.set({ ...DEFAULT_PREFS, userPresets });
                setMsg('Preferências repostas.');
              }}
            >
              Repor as preferências
            </button>
          </div>
          <p className={s.hint}>Tudo fica guardado neste navegador. Nada sai do teu computador.</p>
        </section>

        <section className={s.section}>
          <h3>Atalhos</h3>
          <dl className={s.keys}>
            <dt>
              <kbd>A</kbd>…<kbd>Ç</kbd>
            </dt>
            <dd>Tocar com os dedos (sem câmara)</dd>
            <dt>
              <kbd>Espaço</kbd>
            </dt>
            <dd>Simular a boca aberta</dd>
            <dt>
              <kbd>,</kbd> <kbd>.</kbd>
            </dt>
            <dd>Instrumento anterior / seguinte</dd>
            <dt>
              <kbd>I</kbd>
            </dt>
            <dd>Esconder / mostrar a interface</dd>
            <dt>
              <kbd>E</kbd>
            </dt>
            <dd>Ecrã inteiro</dd>
            <dt>
              <kbd>Esc</kbd>
            </dt>
            <dd>Fechar a gaveta ou voltar a mostrar a interface</dd>
          </dl>
        </section>

        <section className={s.section}>
          <h3>Créditos dos sons</h3>
          <p className={s.hint}>
            Os instrumentos gravados vêm da biblioteca tonejs-instruments (CC-BY 3.0), com amostras
            de VSCO 2, Karoryfer, Universidade de Iowa e Freesound. Os restantes sons são
            sintetizados.
          </p>
          <p className={s.hint}>
            <a href="samples/CREDITS.md" target="_blank" rel="noopener">
              Ver créditos completos
            </a>
          </p>
        </section>
      </div>
    </dialog>
  );
}
