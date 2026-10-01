// Ecrã inicial: dois botões grandes (Tocar livre e Jogar) e, em pequeno, a privacidade, o caminho
// sem câmara e a outra língua. Depois de começar, se a câmara falhar, o mesmo sítio mostra o erro
// e as saídas.
import { session } from '../../app/session';
import { LANG_NAMES, LANGS, setLang, useT } from '../../i18n';
import { getState, useStore } from '../../state/store';
import { IconGamepad, IconPlay } from '../icons/UiIcons';
import s from './StartScreen.module.css';

export function StartScreen() {
  const tr = useT().start;
  const lang = useStore((st) => st.lang);
  // com duas línguas, o link passa à outra; com mais, à seguinte (o seletor completo está nas ⚙)
  const other = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
  return (
    <div className={s.start} role="dialog" aria-labelledby="start-title">
      <h2 id="start-title" className="sr-only">
        {tr.title}
      </h2>
      <div className={s.choices}>
        <button
          type="button"
          className={s.go}
          onClick={() => void session.start()}
          aria-describedby="start-privacy"
          data-testid="start"
        >
          <span className={s.play} aria-hidden>
            <IconPlay width={30} height={30} />
          </span>
          <span className={s.goLabel}>{tr.free}</span>
        </button>
        <button
          type="button"
          className={s.go}
          onClick={() =>
            void session.start().then(() => {
              const st = getState();
              if (st.started && !st.cameraError) session.openGame();
            })
          }
          aria-describedby="start-privacy"
          data-testid="start-game"
        >
          <span className={`${s.play} ${s.playGame}`} aria-hidden>
            <IconGamepad width={30} height={30} />
          </span>
          <span className={s.goLabel}>{tr.game}</span>
        </button>
      </div>
      <p id="start-privacy" className={s.privacy}>
        {tr.privacy}
      </p>
      <button
        type="button"
        className={s.link}
        onClick={() => session.startWithoutCamera()}
        data-testid="start-touch"
      >
        {tr.touch}
      </button>
      <p className={s.keys}>
        {tr.keys} <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd>
        <kbd>F</kbd> ·{' '}
        {tr.rightKeys.map((k) => (
          <kbd key={k}>{k}</kbd>
        ))}{' '}
        · <kbd>{tr.space}</kbd> {tr.mouth}
      </p>
      <button
        type="button"
        className={s.lang}
        lang={other}
        onClick={() => void setLang(other)}
        data-testid="lang-switch"
      >
        {LANG_NAMES[other]}
      </button>
    </div>
  );
}

/** A câmara não abriu: tentar outra vez ou tocar no ecrã. */
export function CameraErrorCard() {
  const error = useStore((st) => st.cameraError);
  const set = useStore((st) => st.set);
  const tr = useT().start;
  if (!error) return null;
  return (
    <div
      className={s.card}
      role="alertdialog"
      aria-labelledby="cam-err-t"
      data-testid="camera-error"
    >
      <h2 id="cam-err-t">{tr.camTitle}</h2>
      <p>{error}</p>
      <div className={s.row}>
        <button type="button" className={s.primary} onClick={() => void session.start()}>
          {tr.retry}
        </button>
        <button
          type="button"
          className={s.secondary}
          onClick={() => set({ cameraError: null, touchKeys: true })}
          data-testid="camera-error-touch"
        >
          {tr.touchShort}
        </button>
      </div>
    </div>
  );
}
