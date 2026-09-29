// Um único requestAnimationFrame partilhado por todos os canvas da interface.
import { useEffect, useRef } from 'react';

type FrameFn = (now: number, dt: number) => void;
const subs = new Set<FrameFn>();
let raf = 0;
let last = 0;

function loop(now: number) {
  raf = subs.size ? requestAnimationFrame(loop) : 0;
  const dt = Math.min(0.1, (now - (last || now)) / 1000);
  last = now;
  subs.forEach((fn) => fn(now, dt));
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
 * `w`/`h` chegam em píxeis CSS; o contexto já está escalado.
 */
export function useCanvas(draw: DrawFn) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ro = new ResizeObserver(() => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      size.current = { w: r.width, h: r.height, dpr };
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
    });
    ro.observe(cv);
    return () => ro.disconnect();
  }, []);
  useFrame((now, dt) => {
    const cv = ref.current;
    const { w, h, dpr } = size.current;
    if (!cv || !w || !h) return;
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(g, w, h, now, dt);
  });
  return ref;
}
