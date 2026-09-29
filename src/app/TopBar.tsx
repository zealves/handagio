import { useStore } from '../state/store';
import type { View } from '../state/types';
import { IconButton } from '../ui/controls/IconButton';
import { Tabs } from '../ui/controls/Tabs';
import {
  IconCamera,
  IconDownload,
  IconLogo,
  IconMusic,
  IconMute,
  IconSettings,
  IconShare,
  IconVolume,
  IconWave,
} from '../ui/icons/UiIcons';
import s from './TopBar.module.css';

interface Props {
  onShare: () => void;
  onDownload: () => void;
  canDownload: boolean;
}

export function TopBar({ onShare, onDownload, canDownload }: Props) {
  const view = useStore((st) => st.view);
  const muted = useStore((st) => st.muted);
  const set = useStore((st) => st.set);
  return (
    <header className={s.bar}>
      <h1 className={s.brand}>
        <IconLogo />
        <span>Vision Sound Cam</span>
      </h1>
      <div className={s.center}>
        <Tabs<View>
          label="Vista"
          controls="conteudo"
          value={view}
          onChange={(v) => set({ view: v })}
          items={[
            { id: 'som', label: 'Som', icon: <IconWave width={18} height={18} /> },
            { id: 'musica', label: 'Música', icon: <IconMusic width={18} height={18} /> },
            { id: 'camara', label: 'Câmara', icon: <IconCamera width={18} height={18} /> },
          ]}
        />
      </div>
      <div className={s.actions}>
        <IconButton label="Partilhar a última gravação" onClick={onShare} disabled={!canDownload}>
          <IconShare />
        </IconButton>
        <IconButton
          label="Descarregar a última gravação"
          onClick={onDownload}
          disabled={!canDownload}
        >
          <IconDownload />
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
