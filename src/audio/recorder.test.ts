import { describe, expect, it } from 'vitest';
import { extensionFor, pickMime } from './recorder';

describe('recorder', () => {
  it('prefere webm/opus', () => {
    expect(pickMime('audio', () => true)).toBe('audio/webm;codecs=opus');
    expect(pickMime('video', () => true)).toBe('video/webm;codecs=vp9,opus');
  });
  it('no Safari cai para mp4', () => {
    const safari = (t: string) => t.includes('mp4');
    expect(pickMime('audio', safari)).toBe('audio/mp4');
    expect(pickMime('video', safari)).toBe('video/mp4;codecs=avc1,mp4a');
  });
  it('sem suporte deixa o navegador escolher', () => {
    expect(pickMime('audio', () => false)).toBe('');
  });
  it('extensões', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('video/mp4')).toBe('mp4');
  });
});
