import { useEffect, useState } from 'react';
import { instrumentInfo } from '../../audio/instruments';
import { DEBUG } from '../../lib/debug';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { frameStats } from '../frame';
import s from './HudOverlay.module.css';

const ENGINE_LABEL = { none: '', hands: 'Mãos', motion: 'Movimento', keyboard: 'Teclado' } as const;

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
  const bpm = useStore((st) => st.bpm);
  const instrument = useStore((st) => st.instrument);
  const recording = useStore((st) => st.recording);
  const since = useStore((st) => st.recordStart);
  const engine = useStore((st) => st.engine);
  const started = useStore((st) => st.started);
  const loop = useStore((st) => st.looper.state);
  if (!started) return null;
  return (
    <div className={s.hud} data-testid="hud">
      <div className={s.col}>
        <span className={s.chip}>
          Nota: <b data-testid="hud-note">{note}</b>
        </span>
        <span className={s.chip}>
          Tempo: <b>{bpm} BPM</b>
        </span>
      </div>
      <div className={`${s.col} ${s.right}`}>
        {recording && (
          <span className={s.rec} role="status" aria-label="A gravar">
            <i aria-hidden /> REC <RecTime since={since} />
          </span>
        )}
        {loop !== 'idle' && (
          <span className={s.chip} data-testid="hud-loop">
            Loop: <b>{{ armed: 'à espera', recording: 'a gravar', playing: 'a tocar' }[loop]}</b>
          </span>
        )}
        <span className={s.chip}>
          Voz: <b>{instrumentInfo(instrument).name}</b>
        </span>
        {engine !== 'none' && (
          <span className={s.mode} title="Modo de deteção">
            {ENGINE_LABEL[engine]}
            {engine === 'hands' && <Fps />}
          </span>
        )}
      </div>
    </div>
  );
}
