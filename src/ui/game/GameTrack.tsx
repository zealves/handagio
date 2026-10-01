// Pista do modo de jogo no palco (por cima das mãos) e os botões de pausa e de sair. Fica montada
// a tocar ou em pausa (CameraStage.tsx), para a vista ficar congelada por baixo do cartão.
import { session } from '../../app/session';
import { audio } from '../../audio/engine';
import { DEFAULT_GAME_FINGERS } from '../../game/config';
import { useT } from '../../i18n';
import { live } from '../../state/live';
import { useStore } from '../../state/store';
import { IconButton } from '../controls/IconButton';
import { useCanvas } from '../frame';
import { IconClose, IconPause } from '../icons/UiIcons';
import { drawGame, type GameLabels } from './drawGame';
import s from './GameTrack.module.css';

export function GameTrack() {
  const tr = useT();
  const fingers = useStore((st) => st.game?.fingers ?? DEFAULT_GAME_FINGERS);
  const labels: GameLabels = {
    go: tr.game.go,
    judge: tr.game.judge,
    combo: tr.game.combo,
    lanes: fingers.map(
      (i) => `${tr.game.handShort[i < 5 ? 'left' : 'right']} ${tr.game.fingerShort[i % 5]}`,
    ),
  };
  const ref = useCanvas((g, w, h) => {
    g.clearRect(0, 0, w, h);
    const run = live.game;
    if (run) drawGame(g, w, h, run, run.viewNow(audio.now), fingers, labels);
  });
  return (
    <>
      <canvas ref={ref} className={s.track} aria-hidden data-testid="game-track" />
      <div className={s.topRight}>
        <IconButton
          label={tr.game.pause}
          onClick={() => session.pauseGame()}
          data-testid="game-pause"
        >
          <IconPause />
        </IconButton>
        <IconButton label={tr.game.exit} onClick={() => session.stopGame()} data-testid="game-exit">
          <IconClose />
        </IconButton>
      </div>
    </>
  );
}
