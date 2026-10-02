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
import { changedLagMs } from '../../game/run';
import { useT } from '../../i18n';
import { fingerName } from '../../i18n/data';
import { getState, useStore } from '../../state/store';
import { KEYMAP } from '../../vision/fingerMap';
import s from './GameDialog.module.css';

/** Dedos do seletor, pela ordem do ecrã de cada mão (sem polegares). */
const LEFT_HAND_FINGERS = [4, 3, 2, 1];
const RIGHT_HAND_FINGERS = [6, 7, 8, 9];

/**
 * Tecla de cada dedo (maiúscula), a partir do `KEYMAP` do modo teclado, exceto o dedo 9: esse
 * tem duas teclas, uma por teclado (`ç` no português, `;` no inglês), por isso vem de
 * `start.rightKeys` (que já distingue a língua) em vez do `KEYMAP` (ver `keyForFinger` abaixo).
 */
const KEY_FOR_FINGER: Partial<Record<number, string>> = {};
for (const [key, finger] of Object.entries(KEYMAP)) {
  if (finger === 9) continue;
  if (!(finger in KEY_FOR_FINGER)) KEY_FOR_FINGER[finger] = key.toUpperCase();
}

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
  // só conta como "fora" se o gesto também começou no fundo (senão arrastar o atraso e largar
  // por cima dele, fora do cartão, saía do jogo sem querer)
  const downOnBackdrop = useRef(false);
  const id = useId();
  const open = game !== null && game.phase !== 'playing';

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      d.showModal();
      // `showModal` focaria o primeiro botão focável (Sair); na pausa isso faria um Enter
      // sem querer acabar a ronda, por isso o foco vai antes para o Continuar
      if (getState().game?.phase === 'paused') resumeRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  // fechar ao começar ou ao continuar (a fase já mudou) não sai do jogo; na pausa, fechar (Esc
  // ou fora) continua a ronda; em setup/resultado, sai
  const closeForPhase = () => {
    const g = getState().game;
    if (!g) return;
    if (g.phase === 'paused') session.resumeGame();
    else if (g.phase !== 'playing') session.stopGame();
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

  const toggleFinger = (f: number) => {
    const next = sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f];
    set({ gameFingers: normalizeGameFingers(next) ?? sel });
  };
  // o dedo 9 vem de `start.rightKeys` (o último, Ç/;), que já é o texto certo na língua atual;
  // os outros são teclas físicas que não mudam com a língua
  const keyForFinger = (f: number): string | undefined =>
    f === 9 ? msgs.start.rightKeys[3] : KEY_FOR_FINGER[f];
  const keys = sel
    .map((f) => keyForFinger(f))
    .filter((k): k is string => !!k)
    .join(' ');

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
                      // "Ind" sozinho repete-se nas duas mãos; o nome completo com a mão
                      // (fingerName, já usado noutros sítios) distingue-os para leitores de ecrã
                      aria-label={fingerName(f)}
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
