import { useCallback } from 'react';
import { session } from '../../app/session';
import { useStore } from '../../state/store';
import { WaveViz } from '../shell/WaveViz';
import { HandOverlay } from './HandOverlay';
import { HudOverlay } from './HudOverlay';
import { ParticleWave } from './ParticleWave';
import { StartScreen } from './StartScreen';
import s from './CameraStage.module.css';

interface Props {
  onStart: () => void;
}

export function CameraStage({ onStart }: Props) {
  const started = useStore((st) => st.started);
  const status = useStore((st) => st.status);
  const bg = useStore((st) => st.stageBg);
  const videoRef = useCallback((v: HTMLVideoElement | null) => session.attachVideo(v), []);
  return (
    <div className={s.window}>
      <div className={s.stage} data-bg={bg} data-testid="stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ opacity: bg === 'camara' ? 1 : 0 }}
          data-testid="video"
        />
        <div className={s.dim} aria-hidden />
        {bg === 'ondas' && <WaveViz className={s.bgWaves} register />}
        <ParticleWave />
        <HandOverlay />
        <HudOverlay />
        {!started && <StartScreen onStart={onStart} />}
        {status && (
          <div className={s.status} role="status">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
