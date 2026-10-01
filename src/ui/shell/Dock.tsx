// Fundo do palco: a mensagem do momento (estado, aviso ou dica), a tira das formas de tocar, as
// pills do som atual e o teclado tátil. As pills abrem a folha na tab certa; deslizar para cima
// sobre elas abre-a na última tab.
import { useEffect, useRef, type PointerEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { instrumentInfo } from '../../audio/instruments';
import { CHORD_MODES, NOTE_NAMES } from '../../audio/theory';
import { useStore } from '../../state/store';
import { DrumPads } from '../bottom/DrumPads';
import { PianoKeyboard } from '../bottom/PianoKeyboard';
import { IconButton } from '../controls/IconButton';
import { instrumentIcon } from '../icons/InstrumentIcons';
import { IconClose } from '../icons/UiIcons';
import { ChordGlyph } from './ChordGlyph';
import { ChordStrip } from './ChordStrip';
import { COACH_TEXT, useCoach } from './coach';
import { useMedia, WIDE } from './media';
import { toggleSheet } from './sheetActions';
import s from './Dock.module.css';

/** Duração do aviso (com "Ver" fica mais tempo, para dar tempo de tocar). */
const NOTICE_MS = 2500;
const NOTICE_ACTION_MS = 5000;
/** Deslocamento para cima (px) que conta como "deslizar para abrir". */
const SWIPE_OPEN = 36;

function Message() {
  const status = useStore((st) => st.status);
  const notice = useStore((st) => st.notice);
  const sheetOpen = useStore((st) => st.sheet !== null);
  const set = useStore((st) => st.set);
  const coach = useCoach();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => set({ notice: null }), notice.tab ? NOTICE_ACTION_MS : NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice, set]);

  if (status)
    return (
      <div className={s.msg} role="status" data-testid="status">
        {status}
      </div>
    );
  if (notice)
    return (
      <div className={s.msg} role="status" data-testid="notice">
        <span>{notice.text}</span>
        {notice.tab && (
          <button
            type="button"
            className={s.msgAction}
            onClick={() => {
              set({ notice: null });
              toggleSheet(notice.tab!);
            }}
            data-sheet-keep=""
          >
            Ver
          </button>
        )}
      </div>
    );
  if (coach.id && !sheetOpen)
    return (
      <div className={`${s.msg} ${s.coach}`} role="status" data-testid="coach">
        <span>{COACH_TEXT[coach.id]}</span>
        <IconButton small label="Dispensar as dicas" onClick={coach.dismiss}>
          <IconClose width={14} height={14} />
        </IconButton>
      </div>
    );
  return null;
}

function Pills() {
  const st = useStore(
    useShallow((x) => ({
      instrument: x.instrument,
      root: x.root,
      scale: x.scale,
      custom: x.noteMode === 'custom',
      chord: x.chord,
      chordStrip: x.chordStrip,
      sheet: x.sheet,
      sheetTab: x.sheetTab,
      status: x.sampleStatus[x.instrument],
      set: x.set,
    })),
  );
  const wide = useMedia(WIDE);
  const swipe = useRef<{ y: number; id: number } | null>(null);
  const info = instrumentInfo(st.instrument);
  const loading = st.status === 'loading';
  const failed = st.status === 'error';
  const chord = CHORD_MODES.find((m) => m.id === st.chord)!;

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') swipe.current = { y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId || sw.y - e.clientY < SWIPE_OPEN) return;
    swipe.current = null;
    if (!st.sheet) st.set({ sheet: st.sheetTab, chordStrip: false });
  };

  return (
    <nav
      className={s.pills}
      aria-label="Som atual"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (swipe.current = null)}
      onPointerCancel={() => (swipe.current = null)}
      data-sheet-keep=""
      data-testid="pills"
    >
      <button
        type="button"
        className={s.pill}
        aria-haspopup="dialog"
        aria-expanded={st.sheet === 'som'}
        aria-label={`Instrumento: ${info.name}${loading ? ' (a carregar)' : failed ? ' (erro ao carregar)' : ''}`}
        title="Instrumentos (, e . para mudar)"
        onClick={() => toggleSheet('som')}
        data-testid="pill-instrument"
      >
        <span className={s.ico}>
          {instrumentIcon(info.id)}
          {loading && <span className={s.ring} aria-hidden />}
          {failed && <span className={s.errDot} aria-hidden />}
        </span>
        <span className={s.label}>{info.name}</span>
      </button>
      <button
        type="button"
        className={s.pill}
        aria-haspopup="dialog"
        aria-expanded={st.sheet === 'notas'}
        aria-label={
          st.custom ? 'Notas: personalizadas' : `Notas: ${NOTE_NAMES[st.root]} ${st.scale}`
        }
        onClick={() => toggleSheet('notas')}
        data-testid="pill-scale"
      >
        <span className={s.label}>
          {st.custom ? 'Notas personalizadas' : `${NOTE_NAMES[st.root]} · ${st.scale}`}
        </span>
      </button>
      {!wide && (
        <button
          type="button"
          className={`${s.pill} ${s.pillIcon}`}
          aria-expanded={st.chordStrip}
          aria-label={`Cada dedo toca: ${chord.label}`}
          title={`Cada dedo toca: ${chord.label} (C)`}
          onClick={() => st.set({ chordStrip: !st.chordStrip, sheet: null })}
          data-chord-keep=""
          data-testid="pill-chord"
        >
          <ChordGlyph mode={st.chord} width={22} height={22} />
        </button>
      )}
    </nav>
  );
}

function TouchKeys() {
  const drum = useStore((st) => instrumentInfo(st.instrument).kind === 'drum');
  return (
    <div className={s.keys} data-testid="touch-keys-panel">
      {drum ? <DrumPads /> : <PianoKeyboard />}
    </div>
  );
}

export function Dock() {
  const started = useStore((st) => st.started);
  const touchKeys = useStore((st) => st.touchKeys);
  if (!started) return null;
  return (
    <div className={s.dock} data-testid="dock">
      <Message />
      <ChordStrip />
      <Pills />
      {touchKeys && <TouchKeys />}
    </div>
  );
}
