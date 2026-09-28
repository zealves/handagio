import type { ReactNode } from 'react';
import { useStore } from '../../state/store';
import { IconLogo } from '../icons/UiIcons';
import { StartScreen } from './StartScreen';
import s from './CameraStage.module.css';

interface Props {
  onStart: () => void;
  bottom?: ReactNode;
}

export function CameraStage({ onStart, bottom }: Props) {
  const started = useStore((st) => st.started);
  const status = useStore((st) => st.status);
  return (
    <div className={s.window}>
      <div className={s.titlebar}>
        <IconLogo width={18} height={18} />
        <span>Vision Sound Cam</span>
        <span className={s.dots} aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className={s.stage}>
        {!started && <StartScreen onStart={onStart} />}
        {status && (
          <div className={s.status} role="status">
            {status}
          </div>
        )}
      </div>
      {bottom && <div className={s.bottom}>{bottom}</div>}
    </div>
  );
}
