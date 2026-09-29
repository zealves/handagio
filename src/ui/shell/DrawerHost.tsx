import { useState, type ReactNode } from 'react';
import { useStore } from '../../state/store';
import type { DrawerId } from '../../state/types';
import { DrumPads } from '../bottom/DrumPads';
import { PianoKeyboard } from '../bottom/PianoKeyboard';
import { LooperPanel } from '../panels/LooperPanel';
import { RecordPanel } from '../panels/RecordPanel';
import { ScalePanel } from '../panels/ScalePanel';
import { TempoPanel } from '../panels/TempoPanel';
import { Drawer } from './Drawer';
import { EffectsDrawer } from './EffectsDrawer';
import { InstrumentPicker } from './InstrumentPicker';
import { DRAWER_TITLES } from './logic';
import s from './shell.module.css';

function content(id: DrawerId): ReactNode {
  switch (id) {
    case 'instrumentos':
      return <InstrumentPicker />;
    case 'escala':
      return <ScalePanel />;
    case 'efeitos':
      return <EffectsDrawer />;
    case 'tempo':
      return (
        <>
          <TempoPanel />
          <LooperPanel />
        </>
      );
    case 'gravacoes':
      return <RecordPanel />;
    case 'rato':
      return (
        <div className={s.mouse}>
          <PianoKeyboard />
          <DrumPads />
        </div>
      );
  }
}

export function DrawerHost() {
  const drawer = useStore((st) => st.drawer);
  const set = useStore((st) => st.set);
  // mantém o título durante o fecho, para não piscar
  const [lastId, setLastId] = useState<DrawerId>('instrumentos');
  if (drawer && drawer !== lastId) setLastId(drawer);
  return (
    <Drawer
      open={!!drawer}
      title={DRAWER_TITLES[drawer ?? lastId]}
      onClose={() => set({ drawer: null })}
      testId="drawer"
    >
      {drawer && content(drawer)}
    </Drawer>
  );
}
