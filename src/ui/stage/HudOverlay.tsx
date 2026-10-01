// HUD mínimo no canto do palco: a nota que soa e, só quando há atividade, a gravação, o looper,
// o modo sem câmara e (se pedido nas definições) as imagens por segundo da deteção.
import { useEffect, useState } from 'react';
import { session } from '../../app/session';
import { useT } from '../../i18n';
import { DEBUG } from '../../lib/debug';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { frameStats } from '../frame';
import { IconCamera, IconLoop } from '../icons/UiIcons';
import s from './HudOverlay.module.css';

function RecTime({ since }: { since: number }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const upd = () => setT(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    const id = setInterval(upd, 500);
    return () => clearInterval(id);
  }, [since]);
  return <b>{`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`}</b>;
}

function Fps() {
  const [t, setT] = useState({ fps: live.fps, ui: frameStats.fps, ms: frameStats.ms });
  useEffect(() => {
    const id = setInterval(
      () => setT({ fps: live.fps, ui: frameStats.fps, ms: frameStats.ms }),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  if (!t.fps) return null;
  return (
    <b data-testid="hud-fps">
      {t.fps} fps{DEBUG && ` · ui ${t.ui} fps · ${t.ms} ms`}
    </b>
  );
}

export function HudOverlay() {
  const note = useStore((st) => st.lastNote);
  const recording = useStore((st) => st.recording);
  const since = useStore((st) => st.recordStart);
  const engine = useStore((st) => st.engine);
  const started = useStore((st) => st.started);
  const loop = useStore((st) => st.looper.state);
  const showFps = useStore((st) => st.showFps);
  const cameraError = useStore((st) => st.cameraError);
  const cameraStarting = useStore((st) => st.cameraStarting);
  const set = useStore((st) => st.set);
  const h = useT().hud;
  if (!started) return null;
  return (
    <div className={s.hud} data-testid="hud">
      <span className={s.chip}>
        {h.note} <b data-testid="hud-note">{note}</b>
      </span>
      {recording && (
        <span className={s.rec} role="status" aria-label={h.recording}>
          <i aria-hidden /> REC <RecTime since={since} />
        </span>
      )}
      {loop !== 'idle' && (
        <button
          type="button"
          className={`${s.chip} ${s.btn}`}
          data-state={loop}
          onClick={() => set({ sheet: 'estudio', sheetTab: 'estudio' })}
          data-sheet-keep=""
          data-testid="hud-loop"
        >
          <IconLoop width={14} height={14} /> {h.loop} <b>{h.loopState[loop]}</b>
        </button>
      )}
      {engine === 'keyboard' && !cameraError && !cameraStarting && (
        <button
          type="button"
          className={`${s.chip} ${s.btn}`}
          onClick={() => void session.start()}
          data-testid="hud-camera"
        >
          <IconCamera width={14} height={14} /> {h.cameraOn}
        </button>
      )}
      {showFps && engine !== 'none' && (
        <span className={s.mode} title={h.engineTitle}>
          {h.engine[engine]}
          {engine === 'hands' && <Fps />}
        </span>
      )}
    </div>
  );
}
