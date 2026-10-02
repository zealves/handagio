// Modo de jogo: menu do jogo (dificuldade, dedos, avançado), cartão de pausa e cartão de
// resultado. A pausa não fecha o cartão: fica aqui, por cima da pista congelada (Tarefa 3).
import { type SyntheticEvent, useEffect, useId, useRef, useState } from 'react';
import { session } from '../../app/session';
import { DIFFICULTIES, LAG_MAX_MS, LAG_MIN_MS, LAG_STEP_MS } from '../../game/config';
import { isUnlocked, LEVELS, levelIndex } from '../../game/levels';
import { changedLagMs } from '../../game/run';
import { useT } from '../../i18n';
import { instrumentText } from '../../i18n/data';
import { getState, useStore } from '../../state/store';
import { InstrumentPicker } from '../shell/InstrumentPicker';
import { FingerPicker } from './FingerPicker';
import s from './GameDialog.module.css';
import { LevelList, Stars } from './LevelList';

/** Nome i18n de um nível pelo id, com o próprio id como rede de segurança. */
function levelName(tr: ReturnType<typeof useT>['game'], id: string): string {
  return tr.levelNames[id as keyof typeof tr.levelNames] ?? id;
}

export function GameDialog() {
  const game = useStore((st) => st.game);
  const best = useStore((st) => st.gameBest);
  const chosen = useStore((st) => st.gameDifficulty);
  const lag = useStore((st) => st.gameLagMs);
  const sel = useStore((st) => st.gameFingers);
  const tab = useStore((st) => st.gameTab);
  const chosenLevel = useStore((st) => st.gameLevel);
  const instrument = useStore((st) => st.instrument);
  const progress = useStore((st) => st.levelProgress);
  const set = useStore((st) => st.set);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const msgs = useT();
  const tr = msgs.game;
  const ref = useRef<HTMLDialogElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  // só conta como "fora" se o gesto também começou no fundo (senão arrastar o atraso e largar
  // por cima dele, fora do cartão, saía do jogo sem querer)
  const downOnBackdrop = useRef(false);
  // a fase anterior, para o efeito abaixo distinguir "o menu abriu agora mesmo" (fase anterior
  // nula) de "voltou ao menu" (fase anterior ronda, pausa ou resultado)
  const prevPhaseRef = useRef<string | null>(null);
  const id = useId();
  const open = game !== null && game.phase !== 'playing';

  // quantos `close` nativos ainda vão chegar de fechos pedidos por nós (`d.close()` abaixo): o
  // evento é entregue numa tarefa à parte (passos de fecho do HTML), por isso pode chegar
  // atrasado — por exemplo, a configuração fecha-se ao começar a ronda e, se se pausar muito
  // depressa a seguir, esse `close` antigo só chega depois de o mesmo <dialog> já ter voltado a
  // abrir para a pausa. Contá-los aqui identifica-os pela origem, não pelo tempo, e evita que
  // continuem a ronda sozinhos, cancelando a pausa.
  const ownCloses = useRef(0);

  // o estado manda: abre ou fecha o <dialog> nativo conforme a fase atual (lida da store, que
  // pode já ir à frente do que está desenhado). Devolve `true` se acabou de o abrir.
  const sync = () => {
    const d = ref.current;
    if (!d) return false;
    const g = getState().game;
    const want = g !== null && g.phase !== 'playing';
    if (want && !d.open) {
      d.showModal();
      return true;
    }
    if (!want && d.open) {
      ownCloses.current++;
      d.close();
    }
    return false;
  };

  // corre a cada mudança de fase, não só quando `open` muda: no resultado, o Esc pode fechar o
  // <dialog> nativo (ver `onNativeClose`) e `backToMenu()` passa a `setup` com `open` sempre
  // `true`, e o menu tem de voltar a abrir na mesma
  useEffect(() => {
    // `showModal` focaria o primeiro botão focável; na pausa isso faria um Enter sem querer
    // acabar a ronda, por isso o foco vai antes para o Continuar
    if (sync() && getState().game?.phase === 'paused') resumeRef.current?.focus();
  }, [open, game?.phase]);

  // o menu do jogo (fase `setup`) pode voltar a aparecer com o diálogo já aberto — pausa ou
  // resultado a chamar `backToMenu()` — e nesse caso o efeito acima não chama `showModal()` (o
  // <dialog> já estava aberto), que é quem foca; sem isto o botão que tinha o foco desaparece com
  // o cartão anterior e o foco cai para <body>. Vindo da ronda (o ✕ da pista), o `showModal()`
  // do efeito acima focaria a dificuldade; aqui fica também no Jogar, como nos outros regressos.
  // Só foca o Jogar nesse regresso (fase anterior ronda/pausa/resultado): na primeira vez que o
  // menu abre (fase anterior nula) o foco por defeito fica no primeiro botão (a dificuldade),
  // como seria sem este efeito — focar o Jogar aí só serviria para, com o cartão a transbordar
  // do ecrã (telemóveis pequenos), arrastar o scroll para baixo e esconder o título.
  // `preventScroll` e repor o scroll a 0 mantêm o cartão visto do topo neste regresso.
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = game?.phase ?? null;
    if (
      game?.phase === 'setup' &&
      ref.current?.open &&
      (prevPhase === 'playing' || prevPhase === 'paused' || prevPhase === 'over')
    ) {
      startRef.current?.focus({ preventScroll: true });
      ref.current.scrollTop = 0;
    }
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
  // Esc: o <dialog> não fecha sozinho; a ação da fase muda o estado e o efeito acima abre ou
  // fecha o cartão conforme a fase nova (no resultado, o menu aparece no mesmo <dialog>). Sem
  // interação desde a abertura, o browser pode mandar um `cancel` que não se pode cancelar: o
  // <dialog> fecha na mesma e a ação fica só para o `close` a seguir — fazê-la aqui também
  // corria-a duas vezes (resultado → menu → modo livre).
  const onCancel = (e: SyntheticEvent<HTMLDialogElement>) => {
    if (!e.nativeEvent.cancelable) return;
    e.preventDefault();
    closeForPhase();
  };
  // `close` nativo: os nossos (`ownCloses`) não fazem nada; os outros foram o browser a fechar
  // o <dialog> sem `cancel` ou com um `cancel` que não se pode cancelar (sem interação desde a
  // abertura, para que uma página não prenda o Esc), e contam como um Esc do cartão que estava
  // aberto. Se a fase nova ainda quiser o cartão (resultado → menu), volta a abri-lo já.
  const onNativeClose = () => {
    if (ownCloses.current > 0) {
      ownCloses.current--;
      return;
    }
    closeForPhase();
    sync();
  };
  const r = game?.phase === 'over' ? game.result : null;
  const learnedLag = r ? changedLagMs(r) : null;
  // "Próximo nível" só aparece se existir e já estiver aberto (pode já o estar de uma ronda
  // anterior, não só por esta: repetir um nível já todo com 3 estrelas não esconde o botão)
  const next = r?.levelId ? LEVELS[levelIndex(r.levelId) + 1] : undefined;
  const nextOpen = !!next && isUnlocked(levelIndex(next.id), progress);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={`${id}-t`}
      onCancel={onCancel}
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
          <div className={s.tabs} role="group" aria-label={tr.title}>
            <button
              type="button"
              className={s.tab}
              aria-pressed={tab === 'levels'}
              onClick={() => set({ gameTab: 'levels' })}
              data-testid="game-tab-levels"
            >
              {tr.tabs.levels}
            </button>
            <button
              type="button"
              className={s.tab}
              aria-pressed={tab === 'practice'}
              onClick={() => set({ gameTab: 'practice' })}
              data-testid="game-tab-practice"
            >
              {tr.tabs.practice}
            </button>
          </div>
          {tab === 'levels' ? (
            <LevelList />
          ) : (
            <>
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
                    {/* velocidade e recorde em linhas próprias: os três cartões com a mesma altura */}
                    <span>{tr.levelDesc[d]}</span>
                    <span>{best[d] ? tr.best(best[d]) : tr.noBest}</span>
                  </button>
                ))}
              </div>
              <div className={s.instrumentRow}>
                <button
                  type="button"
                  className={s.instrumentToggle}
                  aria-expanded={instrumentOpen}
                  onClick={() => setInstrumentOpen((v) => !v)}
                  data-testid="game-instrument"
                >
                  <span>{tr.instrument(instrumentText(instrument).name)}</span>
                  <span aria-hidden="true">{instrumentOpen ? '▾' : '▸'}</span>
                </button>
                {instrumentOpen && <InstrumentPicker />}
              </div>
            </>
          )}
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
              onClick={() =>
                tab === 'levels' ? session.startLevel(chosenLevel) : session.startGame(chosen)
              }
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
          <h2 id={`${id}-t`}>{r.levelId ? levelName(tr, r.levelId) : tr.over}</h2>
          {r.levelId && (
            <>
              <Stars n={r.stars ?? 0} big testId="game-stars" />
              {r.unlocked && (
                <p className={s.unlocked} data-testid="game-unlocked">
                  {tr.unlocked(levelName(tr, r.unlocked))}
                </p>
              )}
            </>
          )}
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
            {r.levelId ? (
              <>
                <button
                  type="button"
                  className={nextOpen ? s.secondary : s.primary}
                  onClick={() => session.restartGame()}
                  data-testid="game-again"
                >
                  {tr.repeat}
                </button>
                {nextOpen && (
                  <button
                    type="button"
                    className={s.primary}
                    onClick={() => session.nextLevel()}
                    data-testid="game-next"
                  >
                    {tr.next}
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                className={s.primary}
                onClick={() => session.restartGame()}
                data-testid="game-again"
              >
                {tr.again}
              </button>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}
