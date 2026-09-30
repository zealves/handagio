import { describe, expect, it } from 'vitest';
import { containRect, coverRect } from './cover';

describe('coverRect', () => {
  it('vídeo 16:9 num palco mais panorâmico: corta em cima e em baixo', () => {
    const r = coverRect(1280, 720, 1600, 720);
    expect(r.w).toBeCloseTo(1600);
    expect(r.h).toBeCloseTo(900);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-90);
  });
  it('vídeo em retrato num palco panorâmico: enche a largura', () => {
    const r = coverRect(720, 1280, 1200, 600);
    expect(r.w).toBeCloseTo(1200);
    expect(r.h / r.w).toBeCloseTo(1280 / 720);
    expect(r.y + r.h / 2).toBeCloseTo(300);
  });
  it('mesma proporção: ocupa a caixa toda', () => {
    expect(coverRect(640, 480, 320, 240)).toEqual({ x: 0, y: 0, w: 320, h: 240 });
  });
  it('fonte sem tamanho: a caixa toda', () => {
    expect(coverRect(0, 0, 100, 50)).toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });
});

describe('containRect', () => {
  it('camada panorâmica num fotograma 16:9: faixa central com a largura toda', () => {
    const r = containRect(1600, 720, 1280, 720);
    expect(r.w).toBeCloseTo(1280);
    expect(r.h).toBeCloseTo(576);
    expect(r.y).toBeCloseTo(72);
  });
  it('é o inverso de cover: o recorte visível do vídeo no palco', () => {
    const stage = { w: 1200, h: 600 };
    const video = { w: 720, h: 1280 };
    const cover = coverRect(video.w, video.h, stage.w, stage.h);
    const crop = containRect(stage.w, stage.h, video.w, video.h);
    // o recorte, levado para o palco pelo mesmo cover, dá a caixa do palco
    const k = cover.w / video.w;
    expect(cover.x + crop.x * k).toBeCloseTo(0);
    expect(cover.y + crop.y * k).toBeCloseTo(0);
    expect(crop.w * k).toBeCloseTo(stage.w);
    expect(crop.h * k).toBeCloseTo(stage.h);
  });
});
