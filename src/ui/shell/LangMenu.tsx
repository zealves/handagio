// Seletor de língua no cabeçalho, sempre à vista (também antes de começar): um botão com o código
// da língua atual que abre a lista das línguas, cada uma escrita na própria língua. Com mais
// línguas, a lista cresce sozinha (vem de LANGS).
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LANG_NAMES, LANGS, setLang, useT, type Lang } from '../../i18n';
import { useStore } from '../../state/store';
import s from './LangMenu.module.css';

export function LangMenu() {
  const lang = useStore((st) => st.lang);
  const label = useT().settings.language;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  // aberto: o foco vai para a língua atual; tocar fora ou Esc fecha
  useEffect(() => {
    if (!open) return;
    items.current[LANGS.indexOf(lang)]?.focus();
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', down);
    return () => window.removeEventListener('pointerdown', down);
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (l: Lang) => {
    setOpen(false);
    btn.current?.focus();
    if (l !== lang) void setLang(l);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
      return;
    }
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const k = items.current.indexOf(document.activeElement as HTMLButtonElement);
    items.current[(k + d + LANGS.length) % LANGS.length]?.focus();
  };

  return (
    <div ref={root} className={s.wrap} onKeyDown={onKey}>
      <button
        ref={btn}
        type="button"
        className={s.btn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}: ${LANG_NAMES[lang]}`}
        title={label}
        onClick={() => setOpen((o) => !o)}
        data-testid="lang-menu"
      >
        {lang.toUpperCase()}
      </button>
      {open && (
        <div role="menu" aria-label={label} className={s.menu}>
          {LANGS.map((l, k) => (
            <button
              key={l}
              ref={(el) => {
                items.current[k] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={l === lang}
              lang={l}
              tabIndex={-1}
              className={s.item}
              onClick={() => pick(l)}
              data-testid={`lang-menu-${l}`}
            >
              {LANG_NAMES[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
