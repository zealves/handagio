import { createContext, useContext, useId, useState, type ReactNode } from 'react';
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

/** Dentro de uma gaveta: título da gaveta (os painéis ficam planos, sem acordeão). */
// eslint-disable-next-line react-refresh/only-export-components
export const PanelFlat = createContext<string | null>(null);

/** Painel em vidro fosco. Em ecrãs estreitos comporta-se como acordeão. */
export function Panel({ title, extra, children, className, defaultOpen = true, testId }: Props) {
  const drawerTitle = useContext(PanelFlat);
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  if (drawerTitle !== null)
    return (
      <section
        className={`${s.flat} ${className ?? ''}`}
        aria-labelledby={title !== drawerTitle ? `${id}-t` : undefined}
        aria-label={title === drawerTitle ? title : undefined}
        data-testid={testId}
      >
        {(title !== drawerTitle || extra) && (
          <div className={s.head}>
            {title !== drawerTitle && (
              <h3 className={s.title} id={`${id}-t`}>
                {title}
              </h3>
            )}
            {extra && <div className={s.extra}>{extra}</div>}
          </div>
        )}
        {children}
      </section>
    );
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
