// O visualizador único da app: ondas sobrepostas. Na faixa por baixo do palco ou, com o fundo
// "Ondas", em grande dentro do palco (aí regista-se para entrar na gravação).
import { useEffect, useRef } from 'react';
import { stageCanvases } from '../../state/stageCanvases';
import { useCanvas } from '../frame';
import { drawWaves } from '../panels/draw';

interface Props {
  className?: string;
  register?: boolean;
}

export function WaveViz({ className, register = false }: Props) {
  const hist = useRef<Float32Array[]>([]);
  const ref = useCanvas((g, w, h, now) => drawWaves(g, w, h, now, hist.current), {
    always: register,
  });
  useEffect(() => {
    if (!register) return;
    const cv = ref.current;
    stageCanvases.waves = cv;
    return () => {
      if (stageCanvases.waves === cv) stageCanvases.waves = null;
    };
  }, [register, ref]);
  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden
      data-testid={register ? 'stage-waves' : 'waves'}
    />
  );
}
