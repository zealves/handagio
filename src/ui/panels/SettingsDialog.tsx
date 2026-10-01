import { useEffect, useId, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import { DEFAULT_PREFS, getState, useStore } from '../../state/store';
import { IconButton } from '../controls/IconButton';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import type { LearnedRange } from '../../vision/adaptive';
import { activeScreenOrder, fingerLabel } from '../../vision/fingerMap';
import { FINGER_COLORS } from '../theme';
import { IconBack, IconClose } from '../icons/UiIcons';
import { FINE_POINTER, useMedia } from '../shell/media';
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
      learnHand: x.learnHand,
      learnedRanges: x.learnedRanges,
      calibrating: x.calibrating,
      engine: x.engine,
      heightPitch: x.heightPitch,
      glide: x.glide,
      sensitivity: x.sensitivity,
      thumbSensitivity: x.thumbSensitivity,
      thumbs: x.thumbs,
      custom: x.noteMode === 'custom',
      muted: x.muted,
      uiHidden: x.uiHidden,
      showFps: x.showFps,
      set: x.set,
    })),
  );
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [cams, setCams] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState('');
  const fine = useMedia(FINE_POINTER);

  useEffect(() => {
    const d = ref.current!;
    if (st.open && !d.open) {
      d.showModal();
      void session.cameras().then(setCams);
    } else if (!st.open && d.open) d.close();
  }, [st.open]);

  const close = () => st.set({ settingsOpen: false });

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
        <button
          type="button"
          className={s.back}
          aria-label="Fechar as definições"
          onClick={close}
          data-testid="settings-back"
        >
          <IconBack width={18} height={18} /> Voltar
        </button>
        <h2 id={`${id}-t`}>Definições</h2>
        <IconButton
          small
          className={s.closeX}
          label="Fechar as definições"
          onClick={close}
          data-testid="settings-close"
        >
          <IconClose width={16} height={16} />
        </IconButton>
      </div>
      <div className={s.body}>
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
              onClick={() => {
                st.set({ calibration: null });
                session.forgetLearned();
              }}
              disabled={!st.calibration && !st.learnedRanges}
              data-testid="reset-calibration"
            >
              Repor calibração
            </button>
          </div>
          <p className={s.hint}>
            {st.engine !== 'hands'
              ? 'A calibração fica disponível quando a deteção das mãos estiver ligada.'
              : st.calibration
                ? 'Limiares calibrados para ti. Para recalibrar: 3 s com os dedos esticados e 3 s com os dedos dobrados. Os polegares não precisam de calibração.'
                : 'Estica os dedos durante 3 s e depois dobra-os durante 3 s. Os limiares ajustam-se à tua mão (os polegares não precisam de calibração).'}
          </p>
          <Toggle
            label="Aprender a minha mão enquanto toco"
            checked={st.learnHand}
            onChange={(v) => st.set({ learnHand: v })}
            testId="learn-hand"
          />
          <p className={s.hint}>
            A app vai vendo até onde cada dedo estica e dobra e ajusta-se sozinha, para o anelar e o
            mindinho tocarem com menos esforço. A calibração, se a fizeres, tem prioridade.
          </p>
          {st.learnHand && st.learnedRanges && (
            <details className={s.details}>
              <summary>Ver o intervalo aprendido</summary>
              <LearnedBars ranges={st.learnedRanges} />
            </details>
          )}
          <Slider
            label="Sensibilidade da visão"
            min={0}
            max={100}
            value={Math.round(st.sensitivity * 100)}
            onChange={(v) => st.set({ sensitivity: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Toggle
            label="Usar também os polegares"
            checked={st.thumbs}
            onChange={(v) => st.set({ thumbs: v })}
            testId="thumbs"
          />
          {st.thumbs && (
            <>
              <Slider
                label="Sensibilidade dos polegares"
                min={0}
                max={100}
                value={Math.round(st.thumbSensitivity * 100)}
                onChange={(v) => st.set({ thumbSensitivity: v / 100 })}
                format={(v) => `${v}%`}
                testId="thumb-sensitivity"
              />
              <p className={s.hint}>
                O polegar toca ao dobrar ou ao mover-se para baixo, depressa, também com a mão
                inclinada. Se os polegares tocam sem querer, baixa. Se custam a tocar, sobe.
              </p>
            </>
          )}
          <Toggle
            label={`A altura da mão escolhe a nota${st.custom ? ' (só no modo Escala)' : ''}`}
            checked={st.heightPitch}
            onChange={(v) => st.set({ heightPitch: v })}
            testId="height-pitch"
          />
          <p className={s.hint}>
            Sobe ou desce a mão antes de dobrar o dedo para tocar uma nota mais aguda ou mais grave.
          </p>
          <Toggle
            label="Arrastar a nota depois de tocar"
            checked={st.glide}
            onChange={(v) => st.set({ glide: v })}
            testId="glide"
          />
          <p className={s.hint}>
            Depois de tocares, sobe ou desce a mão para dobrar o tom. Funciona nos instrumentos de
            nota longa (violino, flauta, órgão, sopros…).
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
            label="Baixar ainda mais a resolução (computadores mais lentos)"
            checked={st.lowRes}
            onChange={(v) => st.set({ lowRes: v })}
          />
        </section>

        <section className={s.section}>
          <h3>Som</h3>
          <Slider
            label="Volume geral"
            min={0}
            max={100}
            value={Math.round(st.volume * 100)}
            onChange={(v) => st.set({ volume: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Toggle
            label="Silenciar"
            checked={st.muted}
            onChange={(v) => st.set({ muted: v })}
            testId="mute"
          />
        </section>

        <section className={s.section}>
          <h3>Aspeto</h3>
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
          <Toggle
            label="Esconder a interface (I)"
            checked={st.uiHidden}
            onChange={(v) => st.set({ uiHidden: v, settingsOpen: !v })}
            testId="hide-ui"
          />
          <Toggle
            label="Mostrar FPS e modo de deteção"
            checked={st.showFps}
            onChange={(v) => st.set({ showFps: v })}
            testId="show-fps"
          />
        </section>

        {fine && (
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
                <kbd>C</kbd>
              </dt>
              <dd>Cada dedo toca…: a forma seguinte</dd>
              <dt>
                <kbd>1</kbd>…<kbd>4</kbd>
              </dt>
              <dd>Abrir Som, Notas, Efeitos ou Estúdio</dd>
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
              <dd>Fechar o menu ou voltar a mostrar a interface</dd>
            </dl>
          </section>
        )}

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

        <section className={s.section}>
          <div className={s.row}>
            <button
              type="button"
              className={p.btn}
              onClick={() => {
                const { userPresets, coachDone } = getState();
                st.set({ ...DEFAULT_PREFS, userPresets, coachDone });
                setMsg('Preferências repostas.');
              }}
            >
              Repor as preferências
            </button>
          </div>
          <p className={s.hint} aria-live="polite">
            {msg || 'Tudo fica guardado neste navegador. Nada sai do teu dispositivo.'}
          </p>
        </section>
      </div>
    </dialog>
  );
}

/**
 * Barrinhas com o intervalo aprendido de cada dedo ativo, pela ordem do ecrã (0 = esticado, em
 * baixo; 1 = dobrado): os 8 dedos que dobram (os polegares não aprendem, ver decisão 65).
 */
function LearnedBars({ ranges }: { ranges: (LearnedRange | null)[] }) {
  return (
    <div
      className={s.bars}
      data-testid="learned-bars"
      aria-label="Intervalo aprendido de cada dedo"
    >
      {activeScreenOrder(false).map((i) => {
        const r = ranges[i];
        const title = r
          ? `${fingerLabel(i)}: ${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%`
          : `${fingerLabel(i)}: ainda a aprender`;
        return (
          <span
            key={i}
            className={i === 1 ? `${s.bar} ${s.barGap}` : s.bar}
            title={title}
            role="img"
            aria-label={title}
          >
            {r && (
              <span
                className={s.barFill}
                style={{
                  bottom: `${r.lo * 100}%`,
                  height: `${(r.hi - r.lo) * 100}%`,
                  background: FINGER_COLORS[i],
                }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}
