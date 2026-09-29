// Escala e acordes, sempre à vista: tónica, escala por grupos, acordes, polegares e as notas
// que cada dedo toca (escritas, da esquerda para a direita).
import { useShallow } from 'zustand/react/shallow';
import { instrumentInfo } from '../../audio/instruments';
import {
  CHORD_MODES,
  chordMidis,
  chordName,
  NOTE_NAMES,
  noteName,
  pitchClassName,
  SCALE_GROUPS,
  type ChordMode,
} from '../../audio/theory';
import { useStore } from '../../state/store';
import { activeScreenOrder, fingerDegree } from '../../vision/fingerMap';
import { Toggle } from '../controls/Toggle';
import { FINGER_COLORS } from '../theme';
import { Panel } from './Panel';
import s from './panels.module.css';

export function ScalePanel() {
  const st = useStore(
    useShallow((x) => ({
      root: x.root,
      scale: x.scale,
      octave: x.octave,
      chord: x.chord,
      thumbs: x.thumbs,
      instrument: x.instrument,
      set: x.set,
    })),
  );
  const drum = instrumentInfo(st.instrument).kind === 'drum';
  const order = activeScreenOrder(st.thumbs);
  const notesOf = (i: number) => chordMidis(fingerDegree(i, st.thumbs), st, st.chord);
  const label = (ms: number[]) => (ms.length > 1 ? chordName(ms) : noteName(ms[0]));

  return (
    <Panel title="Escala e acordes" testId="scale-panel">
      <div className={s.tonicRow}>
        <label className={s.field}>
          Tónica
          <select value={st.root} onChange={(e) => st.set({ root: +e.target.value })}>
            {NOTE_NAMES.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className={s.field} style={{ marginTop: 8 }}>
        <span id="chord-l">Tocar</span>
        <div className={`${s.seg} ${s.segFull}`} role="radiogroup" aria-labelledby="chord-l">
          {CHORD_MODES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={st.chord === c.id}
              title={c.desc}
              onClick={() => st.set({ chord: c.id as ChordMode })}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.scaleList} role="radiogroup" aria-label="Escala">
        {SCALE_GROUPS.map((g) => (
          <div key={g.label} className={s.scaleGroup}>
            <span className={s.scaleGroupLabel}>{g.label}</span>
            <div className={s.scaleChips}>
              {g.scales.map((sc) => (
                <button
                  key={sc}
                  type="button"
                  role="radio"
                  className={s.chip}
                  aria-pressed={st.scale === sc}
                  aria-checked={st.scale === sc}
                  onClick={() => st.set({ scale: sc })}
                  data-testid={`scale-${sc}`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Toggle
        label="Usar também os polegares"
        checked={st.thumbs}
        onChange={(v) => st.set({ thumbs: v })}
        testId="thumbs"
      />

      <div className={s.fingerNotes} aria-label="Notas de cada dedo, da esquerda para a direita">
        {drum ? (
          <p className={s.desc} style={{ margin: 0, minHeight: 0 }}>
            Com percussão, cada dedo toca um som do kit.
          </p>
        ) : (
          [order.filter((i) => i < 5), order.filter((i) => i >= 5)].map((hand, h) => (
            <div key={h} className={s.handRow} aria-label={h ? 'Mão direita' : 'Mão esquerda'}>
              {hand.map((i) => (
                <span
                  key={i}
                  className={s.fingerNote}
                  style={{ ['--c' as string]: FINGER_COLORS[i] }}
                  title={`${i < 5 ? 'Mão esquerda' : 'Mão direita'}, ${['polegar', 'indicador', 'médio', 'anelar', 'mindinho'][i % 5]}: ${notesOf(i).map(pitchClassName).join(' ')}`}
                  data-testid={`finger-note-${i}`}
                >
                  {label(notesOf(i))}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
