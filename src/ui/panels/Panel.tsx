import { useId, useState, type ReactNode } from 'react';
import { IconChevron } from '../icons/UiIcons';
import s from './Panel.module.css';

interface Props {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  testId?: string;
}

/** Painel em vidro fosco. Em ecrãs estreitos comporta-se como acordeão. */
export function Panel({ title, extra, children, className, defaultOpen = true, testId }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section
      className={`${s.panel} ${open ? s.open : s.collapsed} ${className ?? ''}`}
      aria-labelledby={`${id}-t`}
      data-testid={testId}
    >
      <div className={s.head}>
        <h2 className={s.title}>
          <button
            type="button"
            className={s.toggle}
            id={`${id}-t`}
            aria-expanded={open}
            aria-controls={`${id}-b`}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={s.chev}>
              <IconChevron width={14} height={14} />
            </span>
            {title}
          </button>
        </h2>
        {extra && <div className={s.extra}>{extra}</div>}
      </div>
      <div className={s.body} id={`${id}-b`}>
        {children}
      </div>
    </section>
  );
}
