import { describe, expect, it } from 'vitest';
import { sanitizePrefs } from '../ui/shell/logic';
import { detectLang, LANG_NAMES, LANGS, loadLang } from './index';

describe('detectLang', () => {
  it('a língua guardada ganha; uma desconhecida é ignorada', () => {
    expect(detectLang('en', ['pt-PT'])).toBe('en');
    expect(detectLang('pt', ['en-US'])).toBe('pt');
    expect(detectLang('xx', ['en-US'])).toBe('en');
    expect(detectLang(undefined, ['pt-PT'])).toBe('pt');
  });
  it('a do navegador: pt-* é português, a primeira que se conhece ganha, o resto é inglês', () => {
    expect(detectLang(null, ['pt-BR'])).toBe('pt');
    expect(detectLang(null, ['PT'])).toBe('pt');
    expect(detectLang(null, ['fr-FR', 'pt-PT'])).toBe('pt');
    expect(detectLang(null, ['en-GB', 'pt-PT'])).toBe('en');
    expect(detectLang(null, ['fr-FR'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
});

describe('línguas', () => {
  it('pt e en, cada nome na própria língua', () => {
    expect(LANGS).toEqual(['pt', 'en']);
    expect(LANG_NAMES).toEqual({ pt: 'Português', en: 'English' });
  });
  it('carregam a pedido, com o título da página', async () => {
    expect((await loadLang('en')).meta.title).toMatch(/Handagio/);
    expect((await loadLang('pt')).meta.title).toMatch(/Handagio/);
  });
  it('preferência lang desconhecida volta a pt', () => {
    expect(sanitizePrefs({ lang: 'xx' })).toEqual({ lang: 'pt' });
    expect(sanitizePrefs({ lang: 'en' })).toEqual({ lang: 'en' });
  });
});
