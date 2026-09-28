# Arquitetura

```
câmara ─► vision/handTracker ─► vision/gestureEngine ─► eventos ─► audio/engine ─► saída
       └► vision/faceTracker ─► abertura da boca ─────────────────► audio/effects/mouthFx
```

- `src/vision` e `src/audio` são TypeScript puro, sem React. Comunicam por eventos tipados.
- `src/state/store.ts` (Zustand) guarda o estado de baixa frequência (instrumento, escala, efeitos, vista…). Os valores de alta frequência (dobras, pontas dos dedos, nível da boca, espectro) vivem num store transitório (`src/state/live.ts`) lido pelos canvas no seu próprio `requestAnimationFrame`.
- `src/ui` só desenha. Os overlays e visualizadores desenham diretamente em `<canvas>`, sem re-render do React.

Detalhes de cada módulo estão nos comentários de topo de cada ficheiro.
