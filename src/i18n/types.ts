// Tipos e lista das línguas, sem dependências: o store e a lógica pura importam-nos sem ciclos.
import type pt from './locales/pt';

/** Para acrescentar uma língua: um ficheiro em locales/, o id aqui e o nome em `LANG_NAMES`. */
export type Lang = 'pt' | 'en';
export const LANGS: Lang[] = ['pt', 'en'];
/** Cada língua no seu próprio nome (é como aparece no seletor). */
export const LANG_NAMES: Record<Lang, string> = { pt: 'Português', en: 'English' };

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** As mensagens: o tipo do português, que é a fonte de verdade (as outras línguas cumprem-no). */
export type Messages = typeof pt;
