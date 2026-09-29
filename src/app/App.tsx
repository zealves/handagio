import { useEffect } from 'react';
import { useStore } from '../state/store';
import { session } from './session';
import { EffectsPanel } from '../ui/panels/EffectsPanel';
import { InstrumentSelect } from '../ui/panels/InstrumentSelect';
import { LooperPanel } from '../ui/panels/LooperPanel';
import { RecordPanel } from '../ui/panels/RecordPanel';
import { SoundMakerPanel } from '../ui/panels/SoundMakerPanel';
import { StatusPanel } from '../ui/panels/StatusPanel';
import { TempoPanel } from '../ui/panels/TempoPanel';
import { VisualizerPanel } from '../ui/panels/VisualizerPanel';
import { BottomStrip } from '../ui/bottom/BottomStrip';
import { CameraStage } from '../ui/stage/CameraStage';
import s from './App.module.css';
import { TopBar } from './TopBar';

export function App() {
  const view = useStore((st) => st.view);
  const theme = useStore((st) => st.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const offKeys = session.installKeyboard();
    const offSync = session.installStoreSync();
    return () => {
      offKeys();
      offSync();
    };
  }, []);

  return (
    <div className={s.app} data-view={view}>
      <TopBar onShare={() => {}} onDownload={() => {}} canDownload={false} />
      <main className={s.grid}>
        <aside className={`${s.col} ${s.left}`} aria-label="Som e instrumentos">
          <div className={s.only} data-views="som">
            <SoundMakerPanel />
          </div>
          <InstrumentSelect />
          <div className={s.only} data-views="som">
            <StatusPanel />
          </div>
          <TempoPanel />
        </aside>
        <section className={s.center} aria-label="Palco da câmara">
          <CameraStage
            onStart={() => void session.start()}
            bottom={view === 'camara' ? null : <BottomStrip />}
          />
        </section>
        <aside className={`${s.col} ${s.right}`} aria-label="Visualizadores e efeitos">
          <div className={s.only} data-views="som">
            <VisualizerPanel />
          </div>
          <EffectsPanel />
          <RecordPanel />
          <div className={s.looper}>
            <LooperPanel />
          </div>
        </aside>
      </main>
    </div>
  );
}
