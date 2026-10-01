// Cabeçalho: a marca, o seletor de língua (sempre) e, depois de começar, o interruptor Livre |
// Jogo (também durante o jogo) e as ações de topo (teclado tátil, ecrã inteiro, gravar e
// definições), estas escondidas durante o jogo.
import { toggleRecording } from './recording';
import { session } from './session';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { IconButton } from '../ui/controls/IconButton';
import {
  IconExpand,
  IconGamepad,
  IconKeys,
  IconLogo,
  IconMusic,
  IconSettings,
  IconShrink,
} from '../ui/icons/UiIcons';
import { useFullscreen } from '../ui/shell/fullscreen';
import { LangMenu } from '../ui/shell/LangMenu';
import s from './TopBar.module.css';

export function TopBar() {
  const started = useStore((st) => st.started);
  const recording = useStore((st) => st.recording);
  const touchKeys = useStore((st) => st.touchKeys);
  const inGame = useStore((st) => st.game !== null);
  const set = useStore((st) => st.set);
  const fs = useFullscreen();
  const h = useT().header;
  return (
    <header className={s.bar}>
      <h1 className={s.brand}>
        <IconLogo className={s.logo} />
        <span className={s.name}>Handagio</span>
        <span className={s.tag}>Vision Sound Cam</span>
      </h1>
      <div className={s.actions}>
        <LangMenu />
        {started && (
          <div className={s.modes} role="group" aria-label={h.modes}>
            <button
              type="button"
              className={s.mode}
              aria-pressed={!inGame}
              onClick={() => inGame && session.stopGame()}
              data-testid="mode-free"
            >
              <IconMusic aria-hidden />
              <span className={s.modeLabel}>{h.modeFree}</span>
            </button>
            <button
              type="button"
              className={s.mode}
              aria-pressed={inGame}
              onClick={() => !inGame && session.openGame()}
              data-testid="mode-game"
            >
              <IconGamepad aria-hidden />
              <span className={s.modeLabel}>{h.modeGame}</span>
            </button>
          </div>
        )}
        {started && !inGame && (
          <>
            <IconButton
              label={touchKeys ? h.touchHide : h.touchShow}
              aria-pressed={touchKeys}
              onClick={() => set({ touchKeys: !touchKeys })}
              data-testid="touch-keys"
            >
              <IconKeys />
            </IconButton>
            <IconButton
              className={s.wideOnly}
              label={fs.active ? h.exitFullscreen : h.fullscreen}
              aria-pressed={fs.active}
              onClick={fs.toggle}
              data-testid="fullscreen"
            >
              {fs.active ? <IconShrink /> : <IconExpand />}
            </IconButton>
            <button
              type="button"
              className={s.rec}
              aria-pressed={recording}
              aria-label={recording ? h.stopRecording : h.record}
              title={recording ? h.stopRecording : h.record}
              onClick={() => void toggleRecording()}
              data-testid="record"
            >
              <i aria-hidden />
            </button>
            <IconButton
              label={h.settings}
              onClick={() => set({ settingsOpen: true })}
              data-testid="settings-open"
            >
              <IconSettings />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
