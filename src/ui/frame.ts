// Um único requestAnimationFrame partilhado por todos os canvas da interface.
import { useEffect, useRef } from 'react';

type FrameFn = (now: number, dt: number) => void;
const subs = new Set<FrameFn>();
let raf = 0;
let last = 0;

/** FPS do rAF partilhado e tempo médio (ms) gasto pelos subscritores por fotograma. */
export const frameStats = { fps: 0, ms: 0 };
let statT = 0;
let statN = 0;
let statMs = 0;

function loop(now: number) {
  raf = subs.size ? requestAnimationFrame(loop) : 0;
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  const t0 = performance.now();
  subs.forEach((fn) => fn(now, dt));
  statMs += performance.now() - t0;
  statN++;
  if (now - statT >= 1000) {
    frameStats.fps = statN;
    frameStats.ms = +(statMs / Math.max(1, statN)).toFixed(2);
    statT = now;
    statN = 0;
    statMs = 0;
  }
}

export function onFrame(fn: FrameFn): () => void {
  subs.add(fn);
  if (!raf) {
    last = 0;
    raf = requestAnimationFrame(loop);
  }
  return () => {
    subs.delete(fn);
  };
}

/** Chama `fn` a cada fotograma enquanto o componente estiver montado. */
export function useFrame(fn: FrameFn): void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  useEffect(() => onFrame((n, d) => ref.current(n, d)), []);
}

export type DrawFn = (
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  now: number,
  dt: number,
) => void;

/**
 * Canvas com resolução ajustada ao ecrã (devicePixelRatio) e desenho a cada fotograma.
 * `w`/`h` chegam em píxeis CSS; o contexto já está escalado. Não desenha quando está fora do
 * ecrã ou tem tamanho 0, a não ser com `always` (canvases do palco, que a gravação compõe).
 * `maxDpr` limita a densidade de píxeis (por defeito 2).
 */
export function useCanvas(draw: DrawFn, opts: { always?: boolean; maxDpr?: number } = {}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const visible = useRef(true);
  const always = !!opts.always;
  const maxDpr = opts.maxDpr ?? 2;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height, dpr };
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
    });
    ro.observe(cv);
    let io: IntersectionObserver | undefined;
    if (!always && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([e]) => {
        visible.current = e.isIntersecting;
      });
      io.observe(cv);
    }
    return () => {
      ro.disconnect();
      io?.disconnect();
    };
  }, [always, maxDpr]);
  useFrame((now, dt) => {
    const cv = ref.current;
    const { w, h, dpr } = size.current;
    if (!cv || !w || !h || !visible.current) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, h, now, dt);
  });
  return ref;
}
