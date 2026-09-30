// Rodapé por baixo do palco: todos os efeitos à vista, cada um com o nome. No telemóvel e em
// paisagem baixa fica escondido e os efeitos abrem-se pelo menu ⋯ (gaveta Efeitos).
import { EFFECTS } from './effects';
import s from './EffectsFooter.module.css';

/** Ordem no rodapé: os do espaço e do timbre primeiro, a transposição no fim. */
const KNOBS = ['reverb', 'echo', 'filter', 'drive', 'pitch'];

const byId = (id: string) => EFFECTS.find((e) => e.id === id)!;

export function EffectsFooter({ className = '' }: { className?: string }) {
  const Mouth = byId('mouth').Control;
  return (
    <section
      className={`${s.footer} ${className}`}
      aria-label="Efeitos"
      data-testid="effects-footer"
    >
      <span className={s.title} aria-hidden>
        Efeitos
      </span>
      <div className={s.controls}>
        <div className={s.knobs}>
          {KNOBS.map((id) => {
            const { Control } = byId(id);
            return <Control key={id} size={34} compact testId={`footer-${id}`} />;
          })}
        </div>
        <i className={s.sep} aria-hidden />
        <Mouth compact testId="footer-mouth" />
      </div>
    </section>
  );
}
