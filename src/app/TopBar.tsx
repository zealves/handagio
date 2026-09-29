import { useStore } from '../state/store';
import { IconButton } from '../ui/controls/IconButton';
import {
  IconExpand,
  IconLogo,
  IconMute,
  IconSettings,
  IconShrink,
  IconVolume,
} from '../ui/icons/UiIcons';
import { useFullscreen } from '../ui/shell/fullscreen';
import s from './TopBar.module.css';

export function TopBar() {
  const muted = useStore((st) => st.muted);
  const set = useStore((st) => st.set);
  const fs = useFullscreen();
  return (
    <header className={s.bar}>
      <h1 className={s.brand}>
        <IconLogo />
        <span>Vision Sound Cam</span>
      </h1>
      <div className={s.actions}>
        <IconButton
          label={fs.active ? 'Sair do ecrã inteiro (E)' : 'Ecrã inteiro (E)'}
          aria-pressed={fs.active}
          onClick={fs.toggle}
          data-testid="fullscreen"
        >
          {fs.active ? <IconShrink /> : <IconExpand />}
        </IconButton>
        <IconButton
          label={muted ? 'Ligar o som' : 'Silenciar'}
          aria-pressed={muted}
          onClick={() => set({ muted: !muted })}
        >
          {muted ? <IconMute /> : <IconVolume />}
        </IconButton>
        <IconButton label="Definições" onClick={() => set({ settingsOpen: true })}>
          <IconSettings />
        </IconButton>
      </div>
    </header>
  );
}
