import { useEffect } from 'react';
import { useStore } from '../state/store';
import { session } from './session';
import { SettingsDialog } from '../ui/panels/SettingsDialog';
import { ControlBar } from '../ui/shell/ControlBar';
import { DrawerHost } from '../ui/shell/DrawerHost';
import { installRecents } from '../ui/shell/recents';
import { installShortcuts } from '../ui/shell/shortcuts';
import { useAutoHide } from '../ui/shell/useAutoHide';
import { WaveViz } from '../ui/shell/WaveViz';
import { CameraStage } from '../ui/stage/CameraStage';
import s from './App.module.css';
import { TopBar } from './TopBar';

export function App() {
  const theme = useStore((st) => st.theme);
  const uiHidden = useStore((st) => st.uiHidden);
  const stageBg = useStore((st) => st.stageBg);
  const showWaves = useStore((st) => st.showWaves);
  const size = useStore((st) => st.videoSize);
  const peek = useAutoHide(uiHidden);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const offs = [
      session.installKeyboard(),
      session.installStoreSync(),
      installRecents(),
      installShortcuts(),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div className={s.app} data-ui={uiHidden ? (peek ? 'peek' : 'hidden') : 'shown'}>
      <TopBar />
      <main className={s.main} id="conteudo">
        <div
          className={s.stageBox}
          style={size ? { ['--ar' as string]: size.w / size.h } : undefined}
        >
          <CameraStage onStart={() => void session.start()} />
          <div className={s.barSlot} data-testid="bar-slot">
            <ControlBar />
          </div>
        </div>
        {stageBg === 'camara' && showWaves && <WaveViz className={s.strip} />}
      </main>
      <DrawerHost />
      <SettingsDialog />
    </div>
  );
}
