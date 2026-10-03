// Modo de jogo, menu: um cartão por nível, com o nome, o instrumento e as estrelas. Os 3 cartões
// ficam numa só linha, para o Jogar continuar visível sem scroll a 1280×800 (decisão 69); o
// recorde, mais longo, vai para o `title` (dica nativa ao pairar o rato) em vez de ocupar mais
// uma linha. A condição de desbloqueio ("Faz ★ no nível anterior") também lá vai, mas ganha
// ainda uma linha visível partilhada (`UnlockHintLine`) debaixo da lista enquanto houver algum
// nível bloqueado: sem tooltip no toque e com um botão `disabled` que nunca recebe foco, o
// `title` sozinho era invisível para quem joga no telemóvel (decisão 70). Um nível bloqueado
// mostra o cadeado; tocar num aberto só o seleciona — quem começa a ronda é o botão Jogar
// (GameDialog.tsx).
import { instrumentText, levelName } from '../../i18n/data';
import { useT } from '../../i18n';
import { isUnlocked, LEVELS, STAR_THRESHOLDS } from '../../game/levels';
import { useStore } from '../../state/store';
import { IconLock } from '../icons/UiIcons';
import s from './LevelList.module.css';

/** Percentagem de precisão (de `STAR_THRESHOLDS[0]`) que dá a 1.ª ★ e abre o nível seguinte. */
const UNLOCK_PCT = Math.round(STAR_THRESHOLDS[0] * 100);

/**
 * Linha visível com a condição de desbloqueio (decisão 70): a dica ficava só no `title` do
 * cartão (sem tooltip no toque, e um botão `disabled` nem recebe foco), por isso ganha aqui uma
 * linha de texto, partilhada pelos cartões bloqueados da lista e pelo resultado com o nível
 * seguinte ainda fechado. A da lista fica centrada (`left` omitido); a do resultado alinha-se à
 * esquerda, como as outras linhas do cartão.
 */
export function UnlockHintLine({ testId, left }: { testId?: string; left?: boolean }) {
  const tr = useT().game;
  return (
    <p className={left ? s.unlockLineLeft : s.unlockLine} data-testid={testId}>
      {tr.unlockLine(UNLOCK_PCT)}
    </p>
  );
}

/**
 * ★ cheias ou vazias: os glifos ficam `aria-hidden` (são só desenho) e o nome acessível vem do
 * `aria-label` no próprio `<span>` — por isso precisa de `role="img"`, que lhe dá uma semântica
 * ARIA própria; um `<span>` sem `role` (genérico, ARIA 1.2) pode ver o `aria-label` ignorado.
 */
export function Stars({
  n,
  big,
  testId,
}: {
  n: number;
  big?: boolean;
  testId?: string;
}) {
  const tr = useT().game;
  return (
    <span
      role="img"
      className={big ? s.starsBig : s.stars}
      aria-label={tr.starsLabel(n)}
      data-testid={testId}
    >
      {[0, 1, 2].map((i) => (
        <span key={i} aria-hidden="true">
          {i < n ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

export function LevelList() {
  const progress = useStore((st) => st.levelProgress);
  const selected = useStore((st) => st.gameLevel);
  const set = useStore((st) => st.set);
  const tr = useT().game;

  const anyLocked = LEVELS.some((_, i) => !isUnlocked(i, progress));

  return (
    <>
      <div className={s.list} role="group" aria-label={tr.levels}>
        {LEVELS.map((level, i) => {
          const open = isUnlocked(i, progress);
          const entry = progress[level.id];
          const stars = entry?.stars ?? 0;
          const name = levelName(level.id);
          // o recorde (aberto) ou a dica de desbloqueio (fechado) não cabem numa linha do cartão
          // de 3 colunas: ficam só na dica nativa do `title`, lida por leitores de ecrã como
          // descrição do botão (o nome continua a vir do conteúdo visível); a condição de
          // desbloqueio em si tem agora também a linha visível abaixo (`UnlockHintLine`)
          const hint = open ? (entry ? tr.best(entry.points) : tr.noBest) : tr.unlockHint;
          return (
            <button
              key={level.id}
              type="button"
              className={s.card}
              disabled={!open}
              aria-pressed={open && selected === level.id}
              onClick={() => {
                // o próprio `isUnlocked` já é recalculado com o progresso atual; um cartão
                // bloqueado está `disabled`, por isso chegar aqui já implica aberto
                if (open) set({ gameLevel: level.id });
              }}
              title={hint}
              data-testid={`game-level-card-${level.id}`}
            >
              <span className={s.num}>{tr.levelLabel(i + 1)}</span>
              <b>{name}</b>
              <span className={s.instrument}>{instrumentText(level.style.melody).name}</span>
              {open ? (
                <Stars n={stars} />
              ) : (
                <span className={s.locked}>
                  <IconLock width={14} height={14} />
                  {tr.locked}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {anyLocked && <UnlockHintLine testId="game-unlock-hint" />}
    </>
  );
}
