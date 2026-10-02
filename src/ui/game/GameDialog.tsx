// Modo de jogo: menu do jogo (dificuldade, dedos, avançado), cartão de pausa e cartão de
// resultado. A pausa não fecha o cartão: fica aqui, por cima da pista congelada (Tarefa 3).
import { useEffect, useId, useRef } from 'react';
import { session } from '../../app/session';
import { DIFFICULTIES, LAG_MAX_MS, LAG_MIN_MS, LAG_STEP_MS } from '../../game/config';
import { changedLagMs } from '../../game/run';
import { useT } from '../../i18n';
import { getState, useStore } from '../../state/store';
import { FingerPicker } from './FingerPicker';
import s from './GameDialog.module.css';

export function GameDialog() {
  const game = useStore((st) => st.game);
  const best = useStore((st) => st.gameBest);
  const chosen = useStore((st) => st.gameDifficulty);
  const lag = useStore((st) => st.gameLagMs);
  const sel = useStore((st) => st.gameFingers);
  const set = useStore((st) => st.set);
  const msgs = useT();
  const tr = msgs.game;
  const ref = useRef<HTMLDialogElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // só conta como "fora" se o gesto também começou no fundo (senão arrastar o atraso e largar
  // por cima dele, fora do cartão, saía do jogo sem querer)
  const downOnBackdrop = useRef(false);
  const id = useId();
  const open = game !== null && game.phase !== 'playing';

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      // `showModal` focaria o primeiro botão focável; na pausa isso faria um Enter sem querer
      // acabar a ronda, por isso o foco vai antes para o Continuar
      if (getState().game?.phase === 'paused') resumeRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  // o menu do jogo (fase `setup`) pode aparecer com o diálogo já aberto — pausa ou resultado a
  // chamar `backToMenu()` — e nesse caso o efeito acima não corre (o `open` já era `true`); sem
  // isto o botão que tinha o foco desaparece com o cartão anterior e o foco cai para <body>
  useEffect(() => {
    if (game?.phase === 'setup' && ref.current?.open) startRef.current?.focus();
  }, [game?.phase]);

  // fechar ao começar ou ao continuar (a fase já mudou) não sai do jogo; na pausa, fechar (Esc
  // ou fora) continua a ronda; no menu, sai para o modo livre; no resultado, volta ao menu
  const closeForPhase = () => {
    const g = getState().game;
    if (!g) return;
    if (g.phase === 'setup') session.stopGame();
    else if (g.phase === 'paused') session.resumeGame();
    else if (g.phase === 'over') session.backToMenu();
  };
  // o `close` nativo do <dialog> (Esc, cancel) é entregue numa tarefa à parte (passos de fecho
  // do HTML), por isso pode chegar atrasado: a configuração fecha-se sozinha ao começar a ronda
  // e, se se pausar muito depressa a seguir, esse `close` antigo só chega depois de o mesmo
  // <dialog> já ter voltado a abrir para a pausa — nessa altura `closeForPhase` via a fase
  // 'paused' e continuava a ronda sozinho, cancelando a pausa. Um `close` genuíno do cartão
  // atual já encontra o <dialog> fechado (o `open` muda antes de o evento ser entregue); se
  // ainda estiver aberto, é o eco a mais e não deve fazer nada.
  const onNativeClose = () => {
    if (ref.current?.open) return;
    closeForPhase();
  };
  const r = game?.phase === 'over' ? game.result : null;
  const learnedLag = r ? changedLagMs(r) : null;

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={`${id}-t`}
      onClose={onNativeClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === ref.current) closeForPhase();
      }}
      data-testid="game-dialog"
    >
      {game?.phase === 'setup' && (
        <div className={s.body}>
          <h2 id={`${id}-t`}>{tr.title}</h2>
          <p className={s.intro}>{tr.intro}</p>
          <div className={s.levels} role="group" aria-label={tr.difficulty}>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={s.level}
                aria-pressed={chosen === d}
                onClick={() => set({ gameDifficulty: d })}
                data-testid={`game-level-${d}`}
              >
                <b>{tr.levels[d]}</b>
                <span>
                  {tr.levelDesc[d]} · {best[d] ? tr.best(best[d]) : tr.noBest}
                </span>
              </button>
            ))}
          </div>
          <FingerPicker value={sel} onChange={(v) => set({ gameFingers: v })} />
          <details className={s.advanced} data-testid="game-advanced">
            <summary>{tr.advanced}</summary>
            <label className={s.lag}>
              <span>{tr.lag(lag)}</span>
              <input
                type="range"
                min={LAG_MIN_MS}
                max={LAG_MAX_MS}
                step={LAG_STEP_MS}
                value={lag}
                onChange={(e) => set({ gameLagMs: Number(e.target.value) })}
                data-testid="game-lag"
              />
              <small>{tr.lagHint}</small>
            </label>
          </details>
          <div className={s.actions}>
            <button
              ref={startRef}
              type="button"
              className={s.primary}
              onClick={() => session.startGame(chosen)}
              data-testid="game-start"
            >
              {tr.start}
            </button>
          </div>
          <button
            type="button"
            className={s.freeLink}
            onClick={() => session.stopGame()}
            data-testid="game-free"
          >
            {tr.freeMode}
          </button>
        </div>
      )}
      {game?.phase === 'paused' && (
        <div className={s.body}>
          <h2 id={`${id}-t`} data-testid="game-paused">
            {tr.paused}
          </h2>
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => session.backToMenu()}
              data-testid="game-menu"
            >
              {tr.menu}
            </button>
            <button
              type="button"
              className={s.secondary}
              onClick={() => session.restartGame()}
              data-testid="game-restart"
            >
              {tr.restart}
            </button>
            <button
              ref={resumeRef}
              type="button"
              className={s.primary}
              onClick={() => session.resumeGame()}
              data-testid="game-resume"
            >
              {tr.resume}
            </button>
          </div>
        </div>
      )}
      {r && game && (
        <div className={s.body} data-testid="game-result">
          <h2 id={`${id}-t`}>{tr.over}</h2>
          {r.best && (
            <p className={s.newBest} data-testid="game-new-best">
              {tr.newBest}
            </p>
          )}
          <p className={s.points}>{r.points}</p>
          <dl className={s.stats}>
            <dt>{tr.accuracy}</dt>
            <dd>{Math.round(r.accuracy * 100)}%</dd>
            <dt>{tr.maxCombo}</dt>
            <dd>{r.maxCombo}</dd>
          </dl>
          <p className={s.counts}>{tr.counts(r.perfect, r.good, r.miss)}</p>
          {r.meanOffsetMs !== null && <p className={s.counts}>{tr.offset(r.meanOffsetMs)}</p>}
          {learnedLag !== null && (
            <p className={s.counts} data-testid="game-lag-learned">
              {tr.lagLearned(learnedLag)}
            </p>
          )}
          {r.lateTaps > 0 && (
            <p className={s.counts} data-testid="game-late-taps">
              {tr.lateTaps(r.lateTaps)}
            </p>
          )}
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => session.backToMenu()}
              data-testid="game-menu"
            >
              {tr.menu}
            </button>
            <button
              type="button"
              className={s.primary}
              onClick={() => session.startGame(game.difficulty)}
              data-testid="game-again"
            >
              {tr.again}
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
