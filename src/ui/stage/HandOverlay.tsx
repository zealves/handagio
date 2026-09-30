// Canvas do overlay; desenha no seu próprio rAF a partir de `live`, sem re-render do React.
import { useEffect, useRef } from 'react';
import { drawSize } from '../../state/live';
import { stageCanvases } from '../../state/stageCanvases';
import { prefersReducedMotion } from '../theme';
import { drawOverlay } from './drawOverlay';

export function HandOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    stageCanvases.overlay = cv;
    const g = cv.getContext('2d')!;
    const reduced = prefersReducedMotion();
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const d = drawSize();
      if (cv.width !== d.w || cv.height !== d.h) {
        cv.width = d.w;
        cv.height = d.h;
      }
      drawOverlay(g, cv.width, cv.height, reduced);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (stageCanvases.overlay === cv) stageCanvases.overlay = null;
    };
  }, []);
  return <canvas ref={ref} aria-hidden data-testid="overlay" />;
}
