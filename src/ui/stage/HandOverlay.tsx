// Canvas do overlay; desenha no seu próprio rAF a partir de `live`, sem re-render do React.
import { useEffect, useRef } from 'react';
import { live } from '../../state/live';
import { prefersReducedMotion } from '../theme';
import { drawOverlay } from './drawOverlay';

export function HandOverlay() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const g = cv.getContext('2d')!;
    const reduced = prefersReducedMotion();
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (cv.width !== live.videoW || cv.height !== live.videoH) {
        cv.width = live.videoW;
        cv.height = live.videoH;
      }
      drawOverlay(g, cv.width, cv.height, reduced);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} aria-hidden data-testid="overlay" />;
}
