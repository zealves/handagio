import type { ButtonHTMLAttributes, ReactNode } from 'react';
import s from './controls.module.css';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  small?: boolean;
}

export function IconButton({ label, children, small, className, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${s.iconBtn} ${small ? s.small : ''} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}
