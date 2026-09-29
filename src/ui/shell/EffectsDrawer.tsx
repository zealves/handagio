import { EFFECTS } from './effects';
import s from './shell.module.css';

export function EffectsDrawer() {
  return (
    <div className={s.cards} data-testid="effects">
      {EFFECTS.map(({ id, label, desc, Control }) => (
        <section
          key={id}
          className={`${s.card} ${id === 'mouth' ? s.cardWide : ''}`}
          aria-label={label}
        >
          {id === 'mouth' && <h3 className={s.cardHead}>{label}</h3>}
          <Control testId={id === 'reverb' ? 'knob-reverb' : undefined} />
          <p className={s.cardDesc}>{desc}</p>
        </section>
      ))}
    </div>
  );
}
