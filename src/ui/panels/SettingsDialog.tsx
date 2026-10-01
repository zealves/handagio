import { useEffect, useId, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import { DEFAULT_PREFS, getState, useStore } from '../../state/store';
import { IconButton } from '../controls/IconButton';
import { Slider } from '../controls/Slider';
import { Toggle } from '../controls/Toggle';
import type { LearnedRange } from '../../vision/adaptive';
import { activeScreenOrder } from '../../vision/fingerMap';
import { LANG_NAMES, LANGS, setLang, useT } from '../../i18n';
import { fingerName } from '../../i18n/data';
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
      lang: x.lang,
      set: x.set,
    })),
  );
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [cams, setCams] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState('');
  const fine = useMedia(FINE_POINTER);
  const tr = useT().settings;
  const space = useT().start.space;

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
          aria-label={tr.close}
          onClick={close}
          data-testid="settings-back"
        >
          <IconBack width={18} height={18} /> {tr.back}
        </button>
        <h2 id={`${id}-t`}>{tr.title}</h2>
        <IconButton
          small
          className={s.closeX}
          label={tr.close}
          onClick={close}
          data-testid="settings-close"
        >
          <IconClose width={16} height={16} />
        </IconButton>
      </div>
      <div className={s.body}>
        <section className={s.section}>
          <h3>{tr.hands}</h3>
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
              {tr.calibrate}
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
              {tr.resetCalibration}
            </button>
          </div>
          <p className={s.hint}>
            {st.engine !== 'hands'
              ? tr.calibNeedsHands
              : st.calibration
                ? tr.calibrated
                : tr.calibHowTo}
          </p>
          <Toggle
            label={tr.learnHand}
            checked={st.learnHand}
            onChange={(v) => st.set({ learnHand: v })}
            testId="learn-hand"
          />
          <p className={s.hint}>{tr.learnHint}</p>
          {st.learnHand && st.learnedRanges && (
            <details className={s.details}>
              <summary>{tr.learnedShow}</summary>
              <LearnedBars ranges={st.learnedRanges} />
            </details>
          )}
          <Slider
            label={tr.sensitivity}
            min={0}
            max={100}
            value={Math.round(st.sensitivity * 100)}
            onChange={(v) => st.set({ sensitivity: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Toggle
            label={tr.thumbs}
            checked={st.thumbs}
            onChange={(v) => st.set({ thumbs: v })}
            testId="thumbs"
          />
          {st.thumbs && (
            <>
              <Slider
                label={tr.thumbSensitivity}
                min={0}
                max={100}
                value={Math.round(st.thumbSensitivity * 100)}
                onChange={(v) => st.set({ thumbSensitivity: v / 100 })}
                format={(v) => `${v}%`}
                testId="thumb-sensitivity"
              />
              <p className={s.hint}>{tr.thumbHint}</p>
            </>
          )}
          <Toggle
            label={tr.heightPitch(st.custom)}
            checked={st.heightPitch}
            onChange={(v) => st.set({ heightPitch: v })}
            testId="height-pitch"
          />
          <p className={s.hint}>{tr.heightHint}</p>
          <Toggle
            label={tr.glide}
            checked={st.glide}
            onChange={(v) => st.set({ glide: v })}
            testId="glide"
          />
          <p className={s.hint}>{tr.glideHint}</p>
        </section>

        <section className={s.section}>
          <h3>{tr.camera}</h3>
          <label className={p.field}>
            {tr.camera}
            <select
              value={st.cameraId ?? ''}
              onChange={(e) => st.set({ cameraId: e.target.value || null })}
              disabled={cams.length < 2}
            >
              <option value="">{tr.cameraDefault}</option>
              {cams.map((c, k) => (
                <option key={c.id} value={c.id}>
                  {c.label || tr.cameraN(k + 1)}
                </option>
              ))}
            </select>
          </label>
          <Toggle label={tr.lowRes} checked={st.lowRes} onChange={(v) => st.set({ lowRes: v })} />
        </section>

        <section className={s.section}>
          <h3>{tr.sound}</h3>
          <Slider
            label={tr.volume}
            min={0}
            max={100}
            value={Math.round(st.volume * 100)}
            onChange={(v) => st.set({ volume: v / 100 })}
            format={(v) => `${v}%`}
          />
          <Toggle
            label={tr.mute}
            checked={st.muted}
            onChange={(v) => st.set({ muted: v })}
            testId="mute"
          />
        </section>

        <section className={s.section}>
          <h3>{tr.look}</h3>
          <div className={s.row} style={{ justifyContent: 'space-between' }}>
            <span className={p.field} id={`${id}-lang`}>
              {tr.language}
            </span>
            <div className={p.seg} role="radiogroup" aria-labelledby={`${id}-lang`}>
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  lang={l}
                  aria-checked={st.lang === l}
                  onClick={() => void setLang(l)}
                  data-testid={`lang-${l}`}
                >
                  {LANG_NAMES[l]}
                </button>
              ))}
            </div>
          </div>
          <div className={s.row} style={{ justifyContent: 'space-between' }}>
            <span className={p.field} id={`${id}-th`}>
              {tr.theme}
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
                  {t === 'dark' ? tr.dark : tr.light}
                </button>
              ))}
            </div>
          </div>
          <Toggle
            label={tr.hideUi}
            checked={st.uiHidden}
            onChange={(v) => st.set({ uiHidden: v, settingsOpen: !v })}
            testId="hide-ui"
          />
          <Toggle
            label={tr.showFps}
            checked={st.showFps}
            onChange={(v) => st.set({ showFps: v })}
            testId="show-fps"
          />
        </section>

        {fine && (
          <section className={s.section}>
            <h3>{tr.shortcuts}</h3>
            <dl className={s.keys}>
              <dt>
                <kbd>A</kbd>…<kbd>{tr.lastKey}</kbd>
              </dt>
              <dd>{tr.keys.fingers}</dd>
              <dt>
                <kbd>{space}</kbd>
              </dt>
              <dd>{tr.keys.space}</dd>
              <dt>
                <kbd>,</kbd> <kbd>.</kbd>
              </dt>
              <dd>{tr.keys.instrument}</dd>
              <dt>
                <kbd>C</kbd>
              </dt>
              <dd>{tr.keys.chord}</dd>
              <dt>
                <kbd>1</kbd>…<kbd>4</kbd>
              </dt>
              <dd>{tr.keys.tabs}</dd>
              <dt>
                <kbd>I</kbd>
              </dt>
              <dd>{tr.keys.hide}</dd>
              <dt>
                <kbd>E</kbd>
              </dt>
              <dd>{tr.keys.fullscreen}</dd>
              <dt>
                <kbd>Esc</kbd>
              </dt>
              <dd>{tr.keys.esc}</dd>
            </dl>
          </section>
        )}

        <section className={s.section}>
          <h3>{tr.credits}</h3>
          <p className={s.hint}>{tr.creditsText}</p>
          <p className={s.hint}>
            <a href="samples/CREDITS.md" target="_blank" rel="noopener">
              {tr.creditsLink}
            </a>
          </p>
        </section>

        <section className={s.section}>
          <div className={s.row}>
            <button
              type="button"
              className={p.btn}
              onClick={() => {
                // a língua, os sons guardados, as dicas cumpridas e os recordes/dedos do jogo ficam
                const { userPresets, coachDone, lang, gameBest, gameFingers } = getState();
                st.set({ ...DEFAULT_PREFS, userPresets, coachDone, lang, gameBest, gameFingers });
                setMsg(tr.prefsReset);
              }}
            >
              {tr.resetPrefs}
            </button>
          </div>
          <p className={s.hint} aria-live="polite">
            {msg || tr.storedHint}
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
  const tr = useT().settings;
  return (
    <div className={s.bars} data-testid="learned-bars" aria-label={tr.learnedLabel}>
      {activeScreenOrder(false).map((i) => {
        const r = ranges[i];
        const title = r
          ? `${fingerName(i)}: ${Math.round(r.lo * 100)}–${Math.round(r.hi * 100)}%`
          : tr.learnedStill(fingerName(i));
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
