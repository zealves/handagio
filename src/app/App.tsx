import { useEffect } from 'react';
import { useStore } from '../state/store';
import { GameDialog } from '../ui/game/GameDialog';
import { SettingsDialog } from '../ui/panels/SettingsDialog';
import { Dock } from '../ui/shell/Dock';
import { Sheet } from '../ui/shell/Sheet';
import { installShortcuts } from '../ui/shell/shortcuts';
import { useAutoHide } from '../ui/shell/useAutoHide';
import { WaveViz } from '../ui/shell/WaveViz';
import { CameraStage } from '../ui/stage/CameraStage';
import s from './App.module.css';
import { session } from './session';
import { TopBar } from './TopBar';

export function App() {
  const theme = useStore((st) => st.theme);
  const uiHidden = useStore((st) => st.uiHidden);
  const started = useStore((st) => st.started);
  const peek = useAutoHide(uiHidden);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const offs = [session.installKeyboard(), session.installStoreSync(), installShortcuts()];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div
      className={s.app}
      data-ui={uiHidden ? (peek ? 'peek' : 'hidden') : 'shown'}
      data-started={started || undefined}
    >
      <TopBar />
      <main className={s.main} id="conteudo">
        <div className={s.stageBox}>
          <CameraStage />
          <WaveViz className={s.waves} />
          <Dock />
        </div>
      </main>
      <Sheet />
      <SettingsDialog />
      <GameDialog />
    </div>
  );
}
