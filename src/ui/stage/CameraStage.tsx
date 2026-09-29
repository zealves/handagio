import { useCallback } from 'react';
import { session } from '../../app/session';
import { useStore } from '../../state/store';
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
  const videoRef = useCallback((v: HTMLVideoElement | null) => session.attachVideo(v), []);
  return (
    <div className={s.window}>
      <div className={s.stage} data-testid="stage">
        {/* a câmara só alimenta a deteção: fica invisível mas no DOM e a reproduzir (com
            display:none o iOS deixa de entregar fotogramas ao MediaPipe) */}
        <video ref={videoRef} autoPlay playsInline muted data-testid="video" />
        <div className={s.dim} aria-hidden />
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
