// Modo de jogo, separador Níveis: um cartão por nível, com o nome, o instrumento, as estrelas e
// o recorde. Um nível bloqueado mostra o cadeado e a dica; tocar num aberto só o seleciona —
// quem começa a ronda é o botão Jogar, em comum com o Treino (GameDialog.tsx).
import { instrumentText } from '../../i18n/data';
import { useT } from '../../i18n';
import { isUnlocked, LEVELS } from '../../game/levels';
import { useStore } from '../../state/store';
import { IconLock } from '../icons/UiIcons';
import s from './LevelList.module.css';

/** ★ cheias ou vazias, com o `aria-label` da precisão (decorativas por si: o rótulo é o texto). */
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

  return (
    <div className={s.list} role="group" aria-label={tr.tabs.levels}>
      {LEVELS.map((level, i) => {
        const open = isUnlocked(i, progress);
        const entry = progress[level.id];
        const stars = entry?.stars ?? 0;
        const name = tr.levelNames[level.id as keyof typeof tr.levelNames] ?? level.id;
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
            data-testid={`game-level-card-${level.id}`}
          >
            <div className={s.head}>
              <b>{tr.levelLabel(i + 1)}</b>
              <span>{name}</span>
            </div>
            <span className={s.instrument}>{instrumentText(level.style.melody).name}</span>
            {open ? (
              <>
                <Stars n={stars} />
                <span className={s.best}>
                  {entry ? tr.best(entry.points) : tr.noBest}
                </span>
              </>
            ) : (
              <span className={s.locked}>
                <IconLock width={16} height={16} />
                {tr.locked} · {tr.unlockHint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
