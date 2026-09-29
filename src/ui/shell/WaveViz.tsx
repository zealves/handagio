// O visualizador único da app: ondas sobrepostas, na faixa por baixo do palco.
import { useRef } from 'react';
import { useCanvas } from '../frame';
import { drawWaves } from '../panels/draw';

interface Props {
  className?: string;
}

export function WaveViz({ className }: Props) {
  const hist = useRef<Float32Array[]>([]);
  const ref = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, hist.current));
  return <canvas ref={ref} className={className} aria-hidden data-testid="waves" />;
}
