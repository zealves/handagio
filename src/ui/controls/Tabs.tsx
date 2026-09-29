import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import s from './controls.module.css';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface Props<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  /** id do elemento que os separadores controlam */
  controls?: string;
}

/** Separadores em pílula com navegação por setas (padrão ARIA tabs). */
export function Tabs<T extends string>({ items, value, onChange, label, controls }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + items.length) % items.length;
    onChange(items[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={s.tabs}>
      {items.map((it, i) => (
        <button
          key={it.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          aria-selected={value === it.id}
          aria-controls={controls}
          tabIndex={value === it.id ? 0 : -1}
          className={s.tab}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {it.icon}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
