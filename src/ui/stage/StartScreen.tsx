import s from './StartScreen.module.css';

interface Props {
  onStart: () => void;
}

export function StartScreen({ onStart }: Props) {
  return (
    <div className={s.start} role="dialog" aria-labelledby="start-title">
      <h2 id="start-title">Mostra as duas mãos à câmara</h2>
      <p>
        Cada dedo é uma nota: o mindinho esquerdo é o mais grave e o mindinho direito o mais agudo.
        Quanto mais rápido dobras, mais forte soa. Abre a boca para aplicar um efeito.
      </p>
      <button type="button" className={s.go} onClick={onStart} data-testid="start">
        Ligar câmara e som
      </button>
      <p className={s.privacy}>
        🔒 Tudo acontece no teu navegador. O vídeo nunca sai deste computador nem é enviado para
        lado nenhum.
      </p>
      <p className={s.keys}>
        Sem câmara? Toca com <kbd>A</kbd>
        <kbd>S</kbd>
        <kbd>D</kbd>
        <kbd>F</kbd> e <kbd>J</kbd>
        <kbd>K</kbd>
        <kbd>L</kbd>
        <kbd>Ç</kbd>; segura <kbd>Espaço</kbd> para simular a boca aberta.
      </p>
    </div>
  );
}
