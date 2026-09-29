import { useStore } from '../../state/store';
import s from './RecordPanel.module.css';

export function RecordPanel() {
  const recording = useStore((st) => st.recording);
  const set = useStore((st) => st.set);
  return (
    <div className={s.wrap}>
      <button
        type="button"
        className={s.rec}
        aria-pressed={recording}
        onClick={() => set({ recording: !recording, recordStart: Date.now() })}
        data-testid="record"
      >
        {recording ? 'Parar' : 'Gravar'}
      </button>
    </div>
  );
}
