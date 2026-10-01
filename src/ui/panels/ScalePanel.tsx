// Tab Notas: de onde vêm as notas (Escala ou Personalizadas), tónica, escala (as mais usadas e
// "+ mais"), o que cada dedo toca (com a explicação do modo ativo), a pré-visualização das notas
// de cada dedo e a oitava base. No modo Personalizado, cada dedo abre um pequeno editor.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { session } from '../../app/session';
import {
  CUSTOM_MAX,
  CUSTOM_MIN,
  fingerChordOf,
  notesFromScale,
  type NoteMode,
} from '../../app/notes';
import { instrumentInfo } from '../../audio/instruments';
import {
  CHORD_MODES,
  chordName,
  noteNames,
  noteName,
  pitchClassName,
  type ChordMode,
} from '../../audio/theory';
import { useStore } from '../../state/store';
import { activeScreenOrder, type TonicAt } from '../../vision/fingerMap';
import { ChordGlyph } from '../shell/ChordGlyph';
import { keyTarget, visibleScales } from '../shell/logic';
import { t, useT } from '../../i18n';
import { chordText, scaleLabel } from '../../i18n/data';
import { FINGER_COLORS } from '../theme';
import { Panel } from './Panel';
import s from './panels.module.css';

const handOf = (i: number) => (i < 5 ? t().notes.leftHand : t().notes.rightHand);
const fingerWord = (i: number) => t().notes.fingerWords[i % 5];
const fingerText = (i: number) => `${handOf(i)}, ${fingerWord(i)}`;
/** Tempo durante o qual "Copiar da escala" espera pelo segundo clique. */
const CONFIRM_MS = 3000;

const NOTE_MODES: NoteMode[] = ['scale', 'custom'];
const TONIC_AT: TonicAt[] = ['left-pinky', 'right-index'];
/** Oitavas base possíveis (as mesmas do antigo controlo deslizante). */
const OCTAVES = [1, 2, 3, 4, 5, 6];

export function ScalePanel() {
  const st = useStore(
    useShallow((x) => ({
      root: x.root,
      scale: x.scale,
      octave: x.octave,
      chord: x.chord,
      thumbs: x.thumbs,
      instrument: x.instrument,
      tonicAt: x.tonicAt,
      noteMode: x.noteMode,
      customNotes: x.customNotes,
      set: x.set,
    })),
  );
  const id = useId();
  const tr = useT().notes;
  const [editing, setEditing] = useState<number | null>(null);
  // "Copiar da escala": à espera do segundo clique, ou as notas já são iguais às da escala
  const [copyState, setCopyState] = useState<'confirm' | 'same' | null>(null);
  const confirmCopy = copyState === 'confirm';
  const [moreScales, setMoreScales] = useState(false);
  const chordRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const notesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!copyState) return;
    const t = setTimeout(() => setCopyState(null), CONFIRM_MS);
    return () => clearTimeout(t);
  }, [copyState]);

  const drum = instrumentInfo(st.instrument).kind === 'drum';
  const custom = st.noteMode === 'custom';
  const order = activeScreenOrder(st.thumbs);
  const notesOf = (i: number) => fingerChordOf(i, 0, st);
  const label = (ms: number[]) => (ms.length > 1 ? chordName(ms, st.chord) : noteName(ms[0]));
  const editingActive = custom && !drum && editing !== null && order.includes(editing);

  const closeEditor = () => {
    const i = editing;
    setEditing(null);
    if (i !== null)
      notesRef.current
        ?.querySelector<HTMLButtonElement>(`[data-testid="finger-note-${i}"]`)
        ?.focus();
  };
  const pick = (i: number, m: number) => {
    const next = [...st.customNotes];
    next[i] = m;
    st.set({ customNotes: next });
    session.previewNote(m);
  };
  const copyFromScale = () => {
    const next = notesFromScale(st);
    if (next.every((m, i) => m === st.customNotes[i])) {
      setCopyState('same');
      return;
    }
    if (!confirmCopy) {
      setCopyState('confirm');
      return;
    }
    setCopyState(null);
    st.set({ customNotes: next });
  };

  const chordK = CHORD_MODES.findIndex((c) => c.id === st.chord);
  const chordMode = CHORD_MODES[chordK];
  // radiogroups: as setas escolhem logo (o Espaço fica para a boca, decisão 14)
  const onChordKey = (e: KeyboardEvent) => {
    const next = keyTarget(e.key, chordK, CHORD_MODES.length);
    if (next === null) return;
    e.preventDefault();
    st.set({ chord: CHORD_MODES[next].id });
    chordRefs.current[next]?.focus();
  };
  const radioKeys =
    <T,>(list: readonly T[], k: number, pick: (v: T) => void) =>
    (e: KeyboardEvent) => {
      const next = keyTarget(e.key, k, list.length);
      if (next === null) return;
      e.preventDefault();
      pick(list[next]);
      const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]');
      btns[next]?.focus();
    };

  return (
    <Panel title={tr.title} testId="scale-panel">
      <div className={s.stack} style={{ gap: 18 }}>
        <section className={s.section}>
          <h3 className={s.label} id={`${id}-mode`}>
            {tr.from}
          </h3>
          <div
            className={`${s.seg} ${s.segHalf}`}
            role="radiogroup"
            aria-labelledby={`${id}-mode`}
            data-testid="note-mode"
          >
            {NOTE_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={st.noteMode === m}
                onClick={() => {
                  // fechar o editor ao mudar de modo (senão roubava o foco ao voltar)
                  setEditing(null);
                  setCopyState(null);
                  st.set({ noteMode: m });
                }}
                data-testid={`note-mode-${m}`}
              >
                {tr.modes[m]}
              </button>
            ))}
          </div>
          <p className={s.hint}>{custom ? tr.customHint : tr.scaleHint}</p>
        </section>

        {!custom && (
          <>
            <section className={s.section}>
              <h3 className={s.label} id={`${id}-root`}>
                {tr.root}
              </h3>
              <div
                className={s.pillRow}
                role="radiogroup"
                aria-labelledby={`${id}-root`}
                onKeyDown={radioKeys(noteNames(), st.root, (n) =>
                  st.set({ root: noteNames().indexOf(n) }),
                )}
                data-testid="root"
              >
                {noteNames().map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    className={s.pill}
                    aria-checked={st.root === i}
                    tabIndex={st.root === i ? 0 : -1}
                    onClick={() => st.set({ root: i })}
                    data-testid={`root-${i}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>

            <section className={s.section}>
              <h3 className={s.label} id={`${id}-scale`}>
                {tr.scale}
              </h3>
              <div className={s.pillWrap} role="radiogroup" aria-labelledby={`${id}-scale`}>
                {visibleScales(st.scale, moreScales).map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    role="radio"
                    className={s.pill}
                    aria-checked={st.scale === sc}
                    onClick={() => st.set({ scale: sc })}
                    data-testid={`scale-${sc}`}
                  >
                    {scaleLabel(sc)}
                  </button>
                ))}
                <button
                  type="button"
                  className={s.pillMore}
                  aria-expanded={moreScales}
                  onClick={() => setMoreScales((x) => !x)}
                  data-testid="scale-more"
                >
                  {moreScales ? tr.less : tr.more}
                </button>
              </div>
              <p className={s.hint}>{tr.scaleExplain}</p>
            </section>

            <section className={s.section}>
              <h3 className={s.label} id={`${id}-tonic`}>
                {tr.tonicAt}
              </h3>
              <div
                className={`${s.seg} ${s.segHalf}`}
                role="radiogroup"
                aria-labelledby={`${id}-tonic`}
                data-testid="tonic-at"
              >
                {TONIC_AT.map((at) => (
                  <button
                    key={at}
                    type="button"
                    role="radio"
                    aria-checked={st.tonicAt === at}
                    onClick={() => st.set({ tonicAt: at })}
                    data-testid={`tonic-at-${at}`}
                  >
                    {tr.tonicModes[at]}
                  </button>
                ))}
              </div>
              <p className={s.hint}>{st.tonicAt === 'left-pinky' ? tr.tonicLeft : tr.tonicRight}</p>
            </section>
          </>
        )}

        <section className={s.section}>
          <h3 className={s.label} id={`${id}-chord`}>
            {tr.eachFinger}
          </h3>
          <div
            className={s.chordCards}
            role="radiogroup"
            aria-labelledby={`${id}-chord`}
            onKeyDown={onChordKey}
          >
            {CHORD_MODES.map((c, i) => (
              <button
                key={c.id}
                ref={(el) => {
                  chordRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={st.chord === c.id}
                tabIndex={st.chord === c.id ? 0 : -1}
                title={chordText(c.id).desc}
                onClick={() => st.set({ chord: c.id as ChordMode })}
                className={s.card}
                data-testid={`chord-card-${c.id}`}
              >
                <ChordGlyph mode={c.id} width={24} height={24} />
                {chordText(c.id).label}
              </button>
            ))}
          </div>
          <p className={s.cardActive} aria-live="polite">
            <b>{chordText(chordMode.id).label}:</b>{' '}
            {custom ? chordText(chordMode.id).custom : chordText(chordMode.id).desc}
          </p>
        </section>

        <section className={s.section}>
          <h3 className={s.label}>
            {custom ? tr.fingersPlay : tr.fingersPlayIn(noteNames()[st.root], scaleLabel(st.scale))}
          </h3>
          <div ref={notesRef} className={s.fingerNotes} aria-label={tr.fingerNotesLabel}>
            {drum ? (
              <p className={s.desc} style={{ margin: 0, minHeight: 0 }}>
                {tr.drumHint}
              </p>
            ) : (
              [order.filter((i) => i < 5), order.filter((i) => i >= 5)].map((hand, h) => (
                <div key={h} className={s.handRow} aria-label={h ? tr.rightHand : tr.leftHand}>
                  {hand.map((i) =>
                    custom ? (
                      <button
                        key={i}
                        type="button"
                        className={`${s.fingerNote} ${s.fingerNoteBtn}`}
                        style={{ ['--c' as string]: FINGER_COLORS[i] }}
                        aria-label={`${fingerText(i)}: ${noteName(st.customNotes[i])}. ${tr.change}`}
                        aria-expanded={editing === i}
                        aria-controls={editing === i ? `${id}-editor` : undefined}
                        onClick={() => setEditing(editing === i ? null : i)}
                        data-testid={`finger-note-${i}`}
                      >
                        {label(notesOf(i))}
                      </button>
                    ) : (
                      <span
                        key={i}
                        className={s.fingerNote}
                        style={{ ['--c' as string]: FINGER_COLORS[i] }}
                        title={`${fingerText(i)}: ${notesOf(i).map(pitchClassName).join(' ')}`}
                        data-testid={`finger-note-${i}`}
                      >
                        {label(notesOf(i))}
                      </span>
                    ),
                  )}
                </div>
              ))
            )}
          </div>

          {custom && !drum && (
            <>
              {editingActive ? (
                <NoteEditor
                  key={editing}
                  id={`${id}-editor`}
                  finger={editing}
                  midi={st.customNotes[editing]}
                  onPick={(m) => pick(editing, m)}
                  onClose={closeEditor}
                />
              ) : (
                <p className={s.hint}>{tr.tapFinger}</p>
              )}
              <div className={s.copyRow}>
                <button
                  type="button"
                  className={s.btn}
                  aria-pressed={confirmCopy}
                  onClick={copyFromScale}
                  data-testid="copy-from-scale"
                >
                  {confirmCopy ? tr.copyConfirm : tr.copy}
                </button>
                <span className={s.hint} style={{ margin: 0 }} aria-live="polite">
                  {confirmCopy ? tr.copyAgain : copyState === 'same' ? tr.copySame : tr.copyHint}
                </span>
              </div>
            </>
          )}
        </section>

        {!custom && (
          <section className={s.section}>
            <h3 className={s.label} id={`${id}-oct`}>
              {tr.octave}
            </h3>
            <div
              className={s.pillWrap}
              role="radiogroup"
              aria-labelledby={`${id}-oct`}
              onKeyDown={radioKeys(OCTAVES, OCTAVES.indexOf(st.octave), (o) =>
                st.set({ octave: o }),
              )}
              data-testid="octave"
            >
              {OCTAVES.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  className={s.pill}
                  aria-checked={st.octave === o}
                  tabIndex={st.octave === o ? 0 : -1}
                  onClick={() => st.set({ octave: o })}
                  data-testid={`octave-${o}`}
                >
                  {o}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </Panel>
  );
}

interface EditorProps {
  id: string;
  finger: number;
  midi: number;
  onPick: (m: number) => void;
  onClose: () => void;
}

/** Editor inline de uma nota: 12 notas (setas para mover), oitava − / + e "Feito". */
function NoteEditor({ id, finger, midi, onPick, onClose }: EditorProps) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  // o editor é montado de novo para cada dedo (key), por isso o estado começa na nota atual
  const [focus, setFocus] = useState(pc);
  const tr = useT().notes;
  const grid = useRef<HTMLDivElement>(null);
  const focusNote = (k: number) => grid.current?.querySelectorAll('button')[k]?.focus();
  // ao abrir, o foco vai para a nota atual
  useEffect(() => {
    grid.current?.querySelectorAll('button')[focus]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (k: number) => {
    const n = (k + 12) % 12;
    setFocus(n);
    focusNote(n);
  };
  const onGridKey = (e: KeyboardEvent, k: number) => {
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[e.key];
    if (d !== undefined) {
      e.preventDefault();
      move(k + d);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      move(e.key === 'Home' ? 0 : 11);
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    // fecha só o editor, não a gaveta
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  const shift = (d: number) => {
    const m = midi + d * 12;
    if (m >= CUSTOM_MIN && m <= CUSTOM_MAX) onPick(m);
  };

  return (
    <div
      id={id}
      className={s.noteEditor}
      style={{ ['--c' as string]: FINGER_COLORS[finger] }}
      role="group"
      aria-label={tr.editorLabel(fingerWord(finger), handOf(finger).toLowerCase())}
      onKeyDown={onKey}
      data-testid="note-editor"
    >
      <div className={s.noteEditorHead}>
        <span>{fingerText(finger)}</span>
        <strong className="tnum">{noteName(midi)}</strong>
      </div>
      <div ref={grid} className={s.noteGrid} role="radiogroup" aria-label={tr.noteLabel}>
        {noteNames().map((n, k) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={k === pc}
            tabIndex={k === focus ? 0 : -1}
            onClick={() => {
              setFocus(k);
              onPick(12 * (octave + 1) + k);
            }}
            onKeyDown={(e) => onGridKey(e, k)}
            data-sharp={n.includes('♯') || undefined}
            data-testid={`pick-note-${k}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className={s.noteEditorFoot}>
        <div className={s.octave}>
          <button
            type="button"
            className={s.btn}
            aria-label={tr.octaveDown}
            onClick={() => shift(-1)}
            disabled={midi - 12 < CUSTOM_MIN}
          >
            −
          </button>
          <span className="tnum">{tr.octaveN(octave)}</span>
          <button
            type="button"
            className={s.btn}
            aria-label={tr.octaveUp}
            onClick={() => shift(1)}
            disabled={midi + 12 > CUSTOM_MAX}
          >
            +
          </button>
        </div>
        <button type="button" className={s.btn} onClick={onClose} data-testid="note-editor-done">
          {tr.done}
        </button>
      </div>
      <p className={s.hint}>{tr.editorHint}</p>
    </div>
  );
}
