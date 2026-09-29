import { instrumentInfo } from '../../audio/instruments';
import { useStore } from '../../state/store';
import { Panel } from './Panel';
import s from './panels.module.css';

export function StatusPanel() {
  const lastNote = useStore((st) => st.lastNote);
  const bpm = useStore((st) => st.bpm);
  const instrument = useStore((st) => st.instrument);
  const recording = useStore((st) => st.recording);
  const looper = useStore((st) => st.looper.state);
  return (
    <Panel title="Estado">
      <dl className={s.status} data-testid="status-panel">
        <div>
          <dt>Nota</dt>
          <dd data-testid="status-note">{lastNote}</dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>{bpm} BPM</dd>
        </div>
        <div>
          <dt>Voz</dt>
          <dd>{instrumentInfo(instrument).name}</dd>
        </div>
        <div>
          <dt>Gravação</dt>
          <dd className={recording ? s.recOn : undefined}>{recording ? '● A gravar' : 'Parada'}</dd>
        </div>
        <div>
          <dt>Looper</dt>
          <dd>
            {
              { idle: 'Vazio', armed: 'À espera', recording: 'A gravar', playing: 'A tocar' }[
                looper
              ]
            }
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
