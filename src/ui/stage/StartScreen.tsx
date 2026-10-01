// Ecrã inicial: um único botão (Começar) e, em pequeno, a privacidade e o caminho sem câmara.
// Depois de começar, se a câmara falhar, o mesmo sítio mostra o erro e as duas saídas.
import { session } from '../../app/session';
import { useStore } from '../../state/store';
import { IconPlay } from '../icons/UiIcons';
import s from './StartScreen.module.css';

export function StartScreen() {
  return (
    <div className={s.start} role="dialog" aria-labelledby="start-title">
      <h2 id="start-title" className="sr-only">
        Começar a tocar com as mãos
      </h2>
      <button
        type="button"
        className={s.go}
        onClick={() => void session.start()}
        aria-describedby="start-privacy"
        data-testid="start"
      >
        <span className={s.play} aria-hidden>
          <IconPlay width={30} height={30} />
        </span>
        <span className={s.goLabel}>Começar</span>
      </button>
      <p id="start-privacy" className={s.privacy}>
        🔒 O vídeo fica no teu dispositivo: nada é enviado.
      </p>
      <button
        type="button"
        className={s.link}
        onClick={() => session.startWithoutCamera()}
        data-testid="start-touch"
      >
        Sem câmara? Tocar no ecrã
      </button>
      <p className={s.keys}>
        Teclado: <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd>
        <kbd>F</kbd> · <kbd>J</kbd>
        <kbd>K</kbd>
        <kbd>L</kbd>
        <kbd>Ç</kbd> · <kbd>Espaço</kbd> = boca
      </p>
    </div>
  );
}

/** A câmara não abriu: tentar outra vez ou tocar no ecrã. */
export function CameraErrorCard() {
  const error = useStore((st) => st.cameraError);
  const set = useStore((st) => st.set);
  if (!error) return null;
  return (
    <div className={s.card} role="alertdialog" aria-labelledby="cam-err-t" data-testid="camera-error">
      <h2 id="cam-err-t">Sem acesso à câmara</h2>
      <p>{error}</p>
      <div className={s.row}>
        <button type="button" className={s.primary} onClick={() => void session.start()}>
          Tentar outra vez
        </button>
        <button
          type="button"
          className={s.secondary}
          onClick={() => set({ cameraError: null, touchKeys: true })}
          data-testid="camera-error-touch"
        >
          Tocar no ecrã
        </button>
      </div>
    </div>
  );
}
