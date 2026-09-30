// Barra de controlo sobre o palco: só o essencial à vista; o resto abre gavetas.
import { useShallow } from 'zustand/react/shallow';
import { toggleRecording } from '../../app/recording';
import { session } from '../../app/session';
import { instrumentInfo } from '../../audio/instruments';
import { CHORD_MODES, NOTE_NAMES, type ChordMode } from '../../audio/theory';
import { useStore } from '../../state/store';
import type { DrawerId } from '../../state/types';
import { instrumentIcon } from '../icons/InstrumentIcons';
import { IconChevron, IconLoop, IconMetronome, IconMusic, IconSliders } from '../icons/UiIcons';
import { EFFECTS } from './effects';
import { MoreMenu } from './MoreMenu';
import s from './ControlBar.module.css';

/** Nomes curtos para ecrãs médios (o nome completo fica no title e no aria-label). */
const CHORD_SHORT: Record<ChordMode, string> = {
  off: 'Nota',
  triad: '3',
  seventh: '7',
  power: '5',
};

const LOOP_LABEL = {
  idle: 'Gravar loop',
  armed: 'Loop à espera do compasso',
  recording: 'Loop a gravar',
  playing: 'Sobrepor camada no loop',
} as const;

export function ControlBar() {
  const st = useStore(
    useShallow((x) => ({
      instrument: x.instrument,
      root: x.root,
      scale: x.scale,
      custom: x.noteMode === 'custom',
      chord: x.chord,
      bpm: x.bpm,
      metronome: x.metronome,
      recording: x.recording,
      loop: x.looper.state,
      sampleStatus: x.sampleStatus[x.instrument],
      set: x.set,
    })),
  );
  const open = (d: DrawerId) => st.set({ drawer: d });
  const info = instrumentInfo(st.instrument);
  const loading = st.sampleStatus === 'loading';
  const failed = st.sampleStatus === 'error';
  const label = `Instrumento: ${info.name}${loading ? ' (a carregar)' : failed ? ' (erro ao carregar)' : ''}`;
  return (
    <nav className={s.bar} aria-label="Controlos" data-testid="control-bar">
      <button
        type="button"
        className={s.chip}
        aria-haspopup="dialog"
        onClick={() => open('instrumentos')}
        data-testid="chip-instrument"
        aria-label={label}
        title="Instrumentos (, e . para mudar)"
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
        className={s.chip}
        aria-haspopup="dialog"
        onClick={() => open('escala')}
        data-testid="chip-scale"
        aria-label={
          st.custom ? 'Escala: notas personalizadas' : `Escala: ${NOTE_NAMES[st.root]} ${st.scale}`
        }
      >
        <IconMusic />
        {st.custom ? (
          <span className={s.label}>
            Notas<span className={s.long}> · personalizadas</span>
          </span>
        ) : (
          <span className={s.label}>
            {NOTE_NAMES[st.root]}
            <span className={s.long}> · {st.scale}</span>
          </span>
        )}
      </button>
      <div
        role="radiogroup"
        aria-label="Forma de tocar (C para mudar)"
        className={`${s.seg} ${s.mid}`}
        data-testid="chord-seg"
      >
        {CHORD_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={st.chord === m.id}
            aria-label={m.label}
            title={`${m.label}: ${m.desc}`}
            onClick={() => st.set({ chord: m.id })}
            data-testid={`chord-${m.id}`}
          >
            <span className={s.segFull}>{m.label}</span>
            <span className={s.segShort} aria-hidden>
              {CHORD_SHORT[m.id]}
            </span>
          </button>
        ))}
      </div>
      <div className={`${s.quick} ${s.wide}`}>
        {EFFECTS.filter((e) => e.quick).map(({ id, Control }) => (
          <Control key={id} size={30} testId={`quick-${id}`} />
        ))}
      </div>
      <button
        type="button"
        className={`${s.chip} ${s.mid}`}
        aria-haspopup="dialog"
        onClick={() => open('efeitos')}
        data-testid="chip-effects"
        aria-label="Efeitos"
      >
        <IconSliders />
        <span className={s.label}>Efeitos</span>
      </button>
      <button
        type="button"
        className={`${s.chip} ${s.mid}`}
        aria-haspopup="dialog"
        onClick={() => open('tempo')}
        data-testid="chip-tempo"
        aria-label={`Tempo ${st.bpm} BPM${st.metronome ? ', metrónomo ligado' : ''}`}
      >
        <IconMetronome />
        <span className={s.label}>{st.bpm}</span>
        {st.metronome && <i className={s.dot} aria-hidden />}
      </button>
      <div className={s.recGroup}>
        <button
          type="button"
          className={s.rec}
          aria-pressed={st.recording}
          aria-label={st.recording ? 'Parar a gravação' : 'Gravar'}
          onClick={() => void toggleRecording()}
          data-testid="record"
        >
          <i aria-hidden />
        </button>
        <button
          type="button"
          className={s.recMore}
          aria-haspopup="dialog"
          aria-label="Gravações"
          onClick={() => open('gravacoes')}
          data-testid="chip-recordings"
        >
          <IconChevron width={14} height={14} />
        </button>
      </div>
      <button
        type="button"
        className={s.chip}
        data-state={st.loop}
        aria-label={LOOP_LABEL[st.loop]}
        title={LOOP_LABEL[st.loop]}
        onClick={() => session.loopRecord()}
        data-testid="loop-quick"
      >
        <IconLoop />
      </button>
      <MoreMenu />
    </nav>
  );
}
