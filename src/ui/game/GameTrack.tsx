// Pista do modo de jogo no palco (por cima das mãos) e o botão de sair.
import { session } from '../../app/session';
import { audio } from '../../audio/engine';
import { DIFFICULTY } from '../../game/config';
import { useT } from '../../i18n';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { IconButton } from '../controls/IconButton';
import { useCanvas } from '../frame';
import { IconClose } from '../icons/UiIcons';
import { drawGame, type GameLabels } from './drawGame';
import s from './GameTrack.module.css';

export function GameTrack() {
  const difficulty = useStore((st) => st.game?.difficulty ?? 'easy');
  const tr = useT();
  const fingers = DIFFICULTY[difficulty].fingers;
  const labels: GameLabels = {
    go: tr.game.go,
    judge: tr.game.judge,
    combo: tr.game.combo,
    lanes: fingers.map((i) => tr.data.fingers[i % 5]),
  };
  const ref = useCanvas((g, w, h) => {
    g.clearRect(0, 0, w, h);
    const run = live.game;
    if (run) drawGame(g, w, h, run, audio.now, fingers, labels);
  });
  return (
    <>
      <canvas ref={ref} className={s.track} aria-hidden data-testid="game-track" />
      <IconButton
        className={s.exit}
        label={tr.game.exit}
        onClick={() => session.stopGame()}
        data-testid="game-exit"
      >
        <IconClose />
      </IconButton>
    </>
  );
}
