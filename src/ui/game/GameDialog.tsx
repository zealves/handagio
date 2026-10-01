// Modo de jogo: cartão de entrada (dificuldade, recorde, atraso) e cartão de resultado.
import { useEffect, useId, useRef } from 'react';
import { session } from '../../app/session';
import { DIFFICULTIES, LAG_MAX_MS, LAG_MIN_MS, LAG_STEP_MS } from '../../game/config';
import { useT } from '../../i18n';
import { getState, useStore } from '../../state/store';
import s from './GameDialog.module.css';

export function GameDialog() {
  const game = useStore((st) => st.game);
  const best = useStore((st) => st.gameBest);
  const chosen = useStore((st) => st.gameDifficulty);
  const lag = useStore((st) => st.gameLagMs);
  const set = useStore((st) => st.set);
  const tr = useT().game;
  const ref = useRef<HTMLDialogElement>(null);
  // só conta como "fora" se o gesto também começou no fundo (senão arrastar o atraso e largar
  // por cima dele, fora do cartão, saía do jogo sem querer)
  const downOnBackdrop = useRef(false);
  const id = useId();
  // a pausa fica para a pista (Tarefa 3): este cartão só mostra a escolha e o resultado
  const open = game !== null && (game.phase === 'setup' || game.phase === 'over');

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // fechar ao começar (a fase já é 'playing') não sai do jogo; Esc, fora e "Sair" saem
  const onClose = () => {
    const g = getState().game;
    if (g && g.phase !== 'playing') session.stopGame();
  };
  const r = game?.phase === 'over' ? game.result : null;

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={`${id}-t`}
      onClose={onClose}
      onPointerDown={(e) => {
        downOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (downOnBackdrop.current && e.target === ref.current) session.stopGame();
      }}
      data-testid="game-dialog"
    >
      {open && !r && (
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
                <span>{tr.levelDesc[d]}</span>
                <small>{best[d] ? tr.best(best[d]) : tr.noBest}</small>
              </button>
            ))}
          </div>
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
          <div className={s.actions}>
            <button type="button" className={s.secondary} onClick={() => session.stopGame()}>
              {tr.cancel}
            </button>
            <button
              type="button"
              className={s.primary}
              onClick={() => session.startGame(chosen)}
              data-testid="game-start"
            >
              {tr.start}
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
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => session.stopGame()}
              data-testid="game-quit"
            >
              {tr.quit}
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
