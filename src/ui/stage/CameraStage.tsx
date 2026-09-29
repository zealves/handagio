import { useCallback, type ReactNode } from 'react';
import { session } from '../../app/session';
import { useStore } from '../../state/store';
import { IconLogo } from '../icons/UiIcons';
import { HandOverlay } from './HandOverlay';
import { HudOverlay } from './HudOverlay';
import { ParticleWave } from './ParticleWave';
import { StartScreen } from './StartScreen';
import s from './CameraStage.module.css';

interface Props {
  onStart: () => void;
  bottom?: ReactNode;
}

export function CameraStage({ onStart, bottom }: Props) {
  const started = useStore((st) => st.started);
  const status = useStore((st) => st.status);
  const showVideo = useStore((st) => st.showVideo);
  const size = useStore((st) => st.videoSize);
  const videoRef = useCallback((v: HTMLVideoElement | null) => session.attachVideo(v), []);
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
      <div
        className={s.stage}
        style={
          size
            ? { aspectRatio: `${size.w} / ${size.h}`, ['--ar' as string]: size.w / size.h }
            : undefined
        }
        data-testid="stage"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ opacity: showVideo ? 1 : 0 }}
          data-testid="video"
        />
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
      {bottom && <div className={s.bottom}>{bottom}</div>}
    </div>
  );
}
