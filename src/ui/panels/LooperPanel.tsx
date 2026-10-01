import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import { audio } from '../../audio/engine';
import { useStore } from '../../state/store';
import type { LoopBars } from '../../state/types';
import { t, useT } from '../../i18n';
import { Toggle } from '../controls/Toggle';
import { useFrame } from '../frame';
import { IconTrash, IconUndo } from '../icons/UiIcons';
import { Panel } from './Panel';
import s from './panels.module.css';

export function LooperPanel() {
  const st = useStore(
    useShallow((x) => ({
      looper: x.looper,
      loopBars: x.loopBars,
      loopFreeze: x.loopFreeze,
      set: x.set,
    })),
  );
  const tr = useT().looper;
  const bar = useRef<HTMLElement>(null);
  const info = useRef<HTMLSpanElement>(null);
  const lp = session.looper;
  const overdub = st.looper.state === 'playing' && lp.overdubbing;

  useFrame(() => {
    const el = bar.current;
    if (!el) return;
    if (lp.state === 'idle' || !audio.ready) {
      el.style.width = '0';
      return;
    }
    const pos = session.clock.positionAt(audio.now);
    const f = lp.state === 'armed' ? 0 : lp.loopPos(pos) / lp.lengthSteps;
    el.style.width = `${f * 100}%`;
    if (info.current)
      info.current.textContent = t().looper.bar(
        lp.state === 'armed' ? '–' : String(lp.barAt(pos) + 1),
        lp.bars,
      );
  });

  return (
    <Panel title={tr.title} testId="looper">
      <div className={s.tempoRow} style={{ marginTop: 0 }}>
        <span className={s.field} id="bars-l">
          {tr.bars}
        </span>
        <div className={s.seg} role="radiogroup" aria-labelledby="bars-l">
          {([1, 2, 4] as LoopBars[]).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={st.loopBars === b}
              disabled={st.looper.state !== 'idle'}
              onClick={() => st.set({ loopBars: b })}
            >
              {b}
            </button>
          ))}
        </div>
      </div>
      <div className={s.tempoRow}>
        <button
          type="button"
          className={s.btnRec}
          data-state={st.looper.state}
          aria-pressed={overdub}
          onClick={() => session.loopRecord()}
          data-testid="loop-rec"
        >
          {overdub ? tr.closeLayer : tr.state[st.looper.state]}
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => session.loopUndo()}
          disabled={!st.looper.layers && !overdub}
          aria-label={tr.undo}
          title={tr.undo}
        >
          <IconUndo width={16} height={16} />
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => session.loopClear()}
          disabled={st.looper.state === 'idle'}
          aria-label={tr.clear}
          title={tr.clear}
        >
          <IconTrash width={16} height={16} />
        </button>
      </div>
      <div className={s.progress} role="presentation">
        <i ref={bar} />
      </div>
      <div className={s.loopInfo}>
        <span ref={info}>{tr.empty}</span>
        <span>{tr.layers(st.looper.layers)}</span>
      </div>
      <Toggle
        label={tr.freeze}
        checked={st.loopFreeze}
        onChange={(v) => st.set({ loopFreeze: v })}
      />
    </Panel>
  );
}
