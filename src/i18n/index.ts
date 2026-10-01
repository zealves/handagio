// Traduções: um ficheiro por língua em locales/, carregado a pedido (um chunk por língua; o bundle
// principal não leva nenhuma). `t()` serve o código sem React; `useT()` os componentes, que voltam
// a desenhar quando a língua muda. Decisão 66 em docs/DECISIONS.md.
import { useSyncExternalStore } from 'react';
import { useStore } from '../state/store';
import { isLang, type Lang, type Messages } from './types';

export { LANG_NAMES, LANGS, isLang, type Lang, type Messages } from './types';

const loaders = import.meta.glob<{ default: Messages }>('./locales/*.ts');
const cache = new Map<Lang, Messages>();
const listeners = new Set<() => void>();
let current: Messages | null = null;
let currentLang: Lang | null = null;
/** Para que um pedido antigo, mais lento, não troque a língua depois de um mais recente. */
let wanted: Lang | null = null;

/**
 * Língua inicial: a guardada, se for uma das conhecidas; senão a primeira do navegador que se
 * conhece (pelo código de duas letras: pt-BR e PT são português); senão inglês.
 */
export function detectLang(saved: unknown, navLangs: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const l of navLangs) {
    const code = l.toLowerCase().split('-')[0];
    if (isLang(code)) return code;
  }
  return 'en';
}

/** Mensagens de uma língua (descarrega o chunk na primeira vez). */
export async function loadLang(lang: Lang): Promise<Messages> {
  const hit = cache.get(lang);
  if (hit) return hit;
  const load = loaders[`./locales/${lang}.ts`];
  if (!load) throw new Error(`i18n: língua desconhecida (${lang})`);
  const m = (await load()).default;
  cache.set(lang, m);
  return m;
}

/** Muda a língua: carrega-a e só depois troca (nunca há texto misturado). */
export async function setLang(lang: Lang): Promise<void> {
  wanted = lang;
  const m = await loadLang(lang);
  if (wanted !== lang) return;
  current = m;
  currentLang = lang;
  applyPage(m);
  if (useStore.getState().lang !== lang) useStore.getState().set({ lang });
  listeners.forEach((fn) => fn());
}

/** A língua carregada (null antes do arranque). */
export const activeLang = (): Lang | null => currentLang;

/** Mensagens da língua atual. Só depois do arranque (`main.tsx` espera pela primeira). */
export function t(): Messages {
  if (!current) throw new Error('i18n: a língua ainda não foi carregada');
  return current;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Mensagens da língua atual, para componentes React. */
export function useT(): Messages {
  return useSyncExternalStore(subscribe, t);
}

/**
 * Segue a preferência `lang` do store (por exemplo, "Repor as preferências" ou outro separador):
 * se mudar por fora de `setLang`, carrega a nova.
 */
export function installLangSync(): () => void {
  return useStore.subscribe((s) => {
    if (s.lang !== currentLang && s.lang !== wanted) void setLang(s.lang);
  });
}

/** `<html lang>`, título e descrição da página na língua atual. */
function applyPage(m: Messages): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = m.meta.htmlLang;
  document.title = m.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', m.meta.description);
}
