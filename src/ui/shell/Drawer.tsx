// Gaveta sobre <dialog> modal: foco preso, Esc e inert nativos. O conteúdo só é montado
// enquanto está aberta, por isso os seus canvases e useFrame param quando fecha.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from '../controls/IconButton';
import { IconClose } from '../icons/UiIcons';
import { PanelFlat } from '../panels/Panel';
import s from './Drawer.module.css';

interface Props {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}

export function Drawer({ title, open, onClose, children, testId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      opener.current?.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.drawer}
      aria-labelledby={`${id}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      data-testid={testId}
    >
      <div className={s.inner}>
        <div className={s.head}>
          <h2 id={`${id}-t`}>{title}</h2>
          <IconButton small label={`Fechar ${title}`} onClick={onClose}>
            <IconClose width={16} height={16} />
          </IconButton>
        </div>
        <div className={s.body}>
          <PanelFlat.Provider value={title}>{open && children}</PanelFlat.Provider>
        </div>
      </div>
    </dialog>
  );
}
