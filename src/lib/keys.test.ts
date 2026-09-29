import { describe, expect, it } from 'vitest';
import { isTypingTarget } from './keys';

const el = (tagName: string, attrs: Record<string, string> = {}, editable = false) => ({
  tagName,
  isContentEditable: editable,
  getAttribute: (n: string) => attrs[n] ?? null,
});

describe('isTypingTarget', () => {
  it('campos de texto, seletores e sliders contam como escrita', () => {
    expect(isTypingTarget(el('INPUT'))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', {}, true))).toBe(true);
    expect(isTypingTarget(el('DIV', { role: 'slider' }))).toBe(true);
  });
  it('botões e o corpo não contam', () => {
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('BODY'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
