// Geometria de object-fit: o overlay das mãos tem a resolução da câmara e enche o palco com
// `cover`; as partículas (ao tamanho do palco) e a gravação (à resolução da câmara) têm de
// usar a mesma correspondência para as notas nascerem por baixo dos dedos.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Retângulo onde uma fonte srcW×srcH fica desenhada numa caixa boxW×boxH com `cover`. */
export function coverRect(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  if (!(srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: boxW, h: boxH };
  const k = Math.max(boxW / srcW, boxH / srcH);
  const w = srcW * k;
  const h = srcH * k;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

/** Retângulo onde uma fonte srcW×srcH fica desenhada numa caixa boxW×boxH com `contain`. */
export function containRect(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  if (!(srcW > 0 && srcH > 0)) return { x: 0, y: 0, w: boxW, h: boxH };
  const k = Math.min(boxW / srcW, boxH / srcH);
  const w = srcW * k;
  const h = srcH * k;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
