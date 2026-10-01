// Cabeçalho: a marca e, depois de começar, as ações de topo (teclado tátil, ecrã inteiro,
// gravar e definições). Antes de começar fica só a marca: o ecrã inicial tem um único botão.
import { toggleRecording } from './recording';
import { useT } from '../i18n';
import { useStore } from '../state/store';
import { IconButton } from '../ui/controls/IconButton';
import { IconExpand, IconKeys, IconLogo, IconSettings, IconShrink } from '../ui/icons/UiIcons';
import { useFullscreen } from '../ui/shell/fullscreen';
import s from './TopBar.module.css';

export function TopBar() {
  const started = useStore((st) => st.started);
  const recording = useStore((st) => st.recording);
  const touchKeys = useStore((st) => st.touchKeys);
  const set = useStore((st) => st.set);
  const fs = useFullscreen();
  const h = useT().header;
  return (
    <header className={s.bar}>
      <h1 className={s.brand}>
        <IconLogo />
        <span className={s.name}>Handagio</span>
        <span className={s.tag}>Vision Sound Cam</span>
      </h1>
      {started && (
        <div className={s.actions}>
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
        </div>
      )}
    </header>
  );
}
