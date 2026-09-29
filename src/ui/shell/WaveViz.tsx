// O visualizador único da app: ondas sobrepostas, na faixa por baixo do palco.
import { useState } from 'react';
import { useCanvas } from '../frame';
import { createWaveRing, drawWaves } from '../panels/draw';

interface Props {
  className?: string;
}

export function WaveViz({ className }: Props) {
  // criado uma vez (inicialização preguiçosa) e reutilizado em todos os fotogramas
  const [ring] = useState(createWaveRing);
  const ref = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, ring), {
    maxDpr: 1.5,
  });
  return <canvas ref={ref} className={className} aria-hidden data-testid="waves" />;
}
