// Folha de configuração com 4 tabs, sobre <dialog> não modal: o palco continua a tocar por trás
// e não fica escuro (decisão 64). Em baixo no telemóvel e no tablet em retrato (arrasta-se pela
// pega: para cima expande, para baixo fecha); à direita, por cima do palco, em paisagem larga e no
// desktop. Fecha com Esc, ✕ ou um toque fora; o foco volta a quem a abriu. O conteúdo só é montado
// enquanto está aberta, por isso os canvases e useFrame das tabs param quando fecha.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from '../../state/store';
import type { SheetTab } from '../../state/types';
import { IconButton } from '../controls/IconButton';
import { IconClose } from '../icons/UiIcons';
import { LooperPanel } from '../panels/LooperPanel';
import { PanelFlat } from '../panels/Panel';
import { RecordPanel } from '../panels/RecordPanel';
import { ScalePanel } from '../panels/ScalePanel';
import { TempoPanel } from '../panels/TempoPanel';
import { EffectsPanel } from './EffectsPanel';
import { InstrumentPicker } from './InstrumentPicker';
import { keyTarget, SHEET_TABS, SHEET_TITLES } from './logic';
import { SIDE_SHEET, useMedia } from './media';
import { SoundPresets } from './SoundPresets';
import s from './Sheet.module.css';

/** Arrasto (px) que fecha a folha, ou a encolhe quando está expandida. */
const DRAG_CLOSE = 80;
/** Arrasto para cima (px) que a expande. */
const DRAG_EXPAND = 48;

function content(tab: SheetTab) {
  switch (tab) {
    case 'som':
      return (
        <>
          <SoundPresets />
          <InstrumentPicker />
        </>
      );
    case 'notas':
      return <ScalePanel />;
    case 'efeitos':
      return <EffectsPanel />;
    case 'estudio':
      return (
        <>
          <TempoPanel />
          <LooperPanel />
          <RecordPanel />
        </>
      );
  }
}

export function Sheet() {
  const sheet = useStore((st) => st.sheet);
  const lastTab = useStore((st) => st.sheetTab);
  const set = useStore((st) => st.set);
  const side = useMedia(SIDE_SHEET);
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const drag = useRef<{ y: number; id: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const open = sheet !== null;
  const tab = sheet ?? lastTab;
  const close = () => set({ sheet: null });

  useEffect(() => {
    const d = ref.current!;
    if (open && !d.open) {
      opener.current = document.activeElement as HTMLElement | null;
      d.show();
      setExpanded(false);
      tabs.current[SHEET_TABS.indexOf(tab)]?.focus({ preventScroll: true });
    } else if (!open && d.open) {
      // o conteúdo já foi desmontado: se o foco estava lá dentro, caiu no <body>
      const a = document.activeElement;
      const inside = d.contains(a) || !a || a === document.body;
      d.close();
      if (inside) opener.current?.focus({ preventScroll: true });
    }
    // a tab muda sem reabrir: o foco só se mexe ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // tocar fora fecha (as pills e o resto marcado com data-sheet-keep têm a sua própria ação)
  useEffect(() => {
    if (!open) return;
    const down = (e: globalThis.PointerEvent) => {
      const t = e.target as Element;
      if (!ref.current?.contains(t) && !t.closest?.('[data-sheet-keep]')) close();
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (t: SheetTab) => set({ sheet: t, sheetTab: t });
  const onTabKey = (e: KeyboardEvent, k: number) => {
    const next = keyTarget(e.key, k, SHEET_TABS.length);
    if (next === null || e.key === 'ArrowDown' || e.key === 'ArrowUp') return;
    e.preventDefault();
    choose(SHEET_TABS[next]);
    tabs.current[next]?.focus();
  };

  const onGripDown = (e: PointerEvent) => {
    drag.current = { y: e.clientY, id: e.pointerId, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: PointerEvent) => {
    const d = drag.current;
    if (d?.id !== e.pointerId) return;
    d.dy = e.clientY - d.y;
    setDy(d.dy);
  };
  const onGripUp = () => {
    if (!drag.current) return;
    // o valor do arrasto vem da ref: o estado pode ainda não ter sido atualizado
    const dy = drag.current.dy;
    drag.current = null;
    if (dy > DRAG_CLOSE) {
      if (expanded) setExpanded(false);
      else close();
    } else if (dy < -DRAG_EXPAND) setExpanded(true);
    setDy(0);
  };

  return (
    <dialog
      ref={ref}
      className={s.sheet}
      data-side={side || undefined}
      data-expanded={expanded || undefined}
      data-dragging={dy !== 0 || undefined}
      style={dy ? { ['--drag' as string]: `${dy}px` } : undefined}
      aria-label="Configurar o som"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        close();
      }}
      data-testid="sheet"
    >
      {!side && (
        <div
          className={s.grip}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onDoubleClick={() => setExpanded((x) => !x)}
          aria-hidden
          data-testid="sheet-grip"
        >
          <i />
        </div>
      )}
      <div className={s.head}>
        <div role="tablist" aria-label="Configuração" className={s.tabs}>
          {SHEET_TABS.map((t, k) => (
            <button
              key={t}
              ref={(el) => {
                tabs.current[k] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-${t}`}
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              className={s.tab}
              onClick={() => choose(t)}
              onKeyDown={(e) => onTabKey(e, k)}
              title={`${SHEET_TITLES[t]} (${k + 1})`}
              data-testid={`tab-${t}`}
            >
              {SHEET_TITLES[t]}
            </button>
          ))}
        </div>
        <IconButton label="Fechar" onClick={close} data-testid="sheet-close">
          <IconClose width={16} height={16} />
        </IconButton>
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
        className={s.body}
        data-testid={`panel-${tab}`}
      >
        <PanelFlat.Provider value={SHEET_TITLES[tab]}>{open && content(tab)}</PanelFlat.Provider>
      </div>
    </dialog>
  );
}
