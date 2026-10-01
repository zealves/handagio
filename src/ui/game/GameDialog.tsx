// Modo de jogo: cartão de entrada (dificuldade, dedos, atraso), cartão de pausa e cartão de
// resultado. A pausa não fecha o cartão: fica aqui, por cima da pista congelada (Tarefa 3).
import { useEffect, useId, useRef } from 'react';
import { session } from '../../app/session';
import {
  DIFFICULTIES,
  LAG_MAX_MS,
  LAG_MIN_MS,
  LAG_STEP_MS,
  MIN_GAME_FINGERS,
  normalizeGameFingers,
} from '../../game/config';
import { useT } from '../../i18n';
import { getState, useStore } from '../../state/store';
import { KEYMAP } from '../../vision/fingerMap';
import s from './GameDialog.module.css';

/** Dedos do seletor, pela ordem do ecrã de cada mão (sem polegares). */
const LEFT_HAND_FINGERS = [4, 3, 2, 1];
const RIGHT_HAND_FINGERS = [6, 7, 8, 9];

/**
 * Tecla de cada dedo (maiúscula), a partir do `KEYMAP` do modo teclado. O dedo 9 tem duas teclas
 * (`ç` e `;`, o mesmo lugar físico em layouts diferentes); fica a primeira do objeto (`ç`).
 */
const KEY_FOR_FINGER: Partial<Record<number, string>> = {};
for (const [key, finger] of Object.entries(KEYMAP)) {
  if (!(finger in KEY_FOR_FINGER)) KEY_FOR_FINGER[finger] = key.toUpperCase();
}

export function GameDialog() {
  const game = useStore((st) => st.game);
  const best = useStore((st) => st.gameBest);
  const chosen = useStore((st) => st.gameDifficulty);
  const lag = useStore((st) => st.gameLagMs);
  const sel = useStore((st) => st.gameFingers);
  const set = useStore((st) => st.set);
  const tr = useT().game;
  const ref = useRef<HTMLDialogElement>(null);
  // só conta como "fora" se o gesto também começou no fundo (senão arrastar o atraso e largar
  // por cima dele, fora do cartão, saía do jogo sem querer)
  const downOnBackdrop = useRef(false);
  const id = useId();
  const open = game !== null && game.phase !== 'playing';

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // fechar ao começar ou ao continuar (a fase já mudou) não sai do jogo; na pausa, fechar (Esc
  // ou fora) continua a ronda; em setup/resultado, sai
  const closeForPhase = () => {
    const g = getState().game;
    if (!g) return;
    if (g.phase === 'paused') session.resumeGame();
    else if (g.phase !== 'playing') session.stopGame();
  };
  const r = game?.phase === 'over' ? game.result : null;

  const toggleFinger = (f: number) => {
    const next = sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f];
    set({ gameFingers: normalizeGameFingers(next) ?? sel });
  };
  const keys = sel
    .map((f) => KEY_FOR_FINGER[f])
    .filter((k): k is string => !!k)
    .join(' ');

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={`${id}-t`}
      onClose={closeForPhase}
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
                <span>{tr.levelDesc[d]}</span>
                <small>{best[d] ? tr.best(best[d]) : tr.noBest}</small>
              </button>
            ))}
          </div>
          <fieldset className={s.fingers}>
            <legend>{tr.fingers}</legend>
            <div className={s.fingerHands}>
              {(
                [
                  ['left', LEFT_HAND_FINGERS],
                  ['right', RIGHT_HAND_FINGERS],
                ] as const
              ).map(([hand, fingers]) => (
                <div key={hand} className={s.fingerHand}>
                  <b>{tr.handShort[hand]}</b>
                  {fingers.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className={s.fingerBtn}
                      aria-pressed={sel.includes(f)}
                      disabled={sel.length === MIN_GAME_FINGERS && sel.includes(f)}
                      onClick={() => toggleFinger(f)}
                      data-testid={`game-finger-${f}`}
                    >
                      {tr.fingerShort[f % 5]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {sel.length === MIN_GAME_FINGERS && <p className={s.minFingers}>{tr.minFingers}</p>}
            <p className={s.lanesInfo} data-testid="game-lanes">
              {tr.lanes(sel.length)} · {tr.keysHint(keys)}
            </p>
          </fieldset>
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
      {game?.phase === 'paused' && (
        <div className={s.body}>
          <h2 id={`${id}-t`} data-testid="game-paused">
            {tr.paused}
          </h2>
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
              className={s.secondary}
              onClick={() => session.restartGame()}
              data-testid="game-restart"
            >
              {tr.restart}
            </button>
            <button
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
          {r.lagMs !== null && (
            <p className={s.counts} data-testid="game-lag-learned">
              {tr.lagLearned(r.lagMs)}
            </p>
          )}
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
