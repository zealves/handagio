# Arquitetura

```
             ┌──────────────── src/app/session.ts (rAF próprio) ────────────────┐
câmara ──► vision/camera ──► vision/handTracker ──► vision/gestureEngine ──┐     │
                        └──► vision/faceTracker ──► abertura da boca       │     │
                        └──► vision/motionFallback (modo movimento) ───────┤     │
teclado A S D F / J K L Ç ─────────────────────────────────────────────────┤     │
                                                                           ▼     │
                    audio/metronome (Clock) ─► quantização ─► audio/engine ──► saída
                                         └──► audio/looper ─┘        │
                                                                     ├─► audio/analyser ─► canvas da UI
                                                                     └─► audio/recorder ─► IndexedDB
```

## Camadas

- **`src/vision`** e **`src/audio`**: TypeScript puro, sem React. Comunicam por eventos tipados (`lib/emitter.ts`). O `GestureEngine` emite `noteOn(finger, velocity, shift)`, `noteOff(finger)`, `continuous(finger, level, pitch)` e `glide(finger, pitch)`.
- **`src/app/session.ts`**: o orquestrador. Liga a câmara, carrega os modelos (timeout de 20 s; sem resultados em 6 s passa ao modo movimento), corre o ciclo de deteção num `requestAnimationFrame` próprio, traduz eventos de gestos em notas (escala, tónica, oitava, polegares), aplica a quantização, grava no looper e gere a calibração e o modo teclado.
- **`src/state`**:
  - `store.ts` (Zustand + `persist`): preferências (guardadas em `localStorage`) e estado de baixa frequência (gaveta aberta, interface escondida, estado da câmara, gravação, looper).
  - `live.ts`: store transitório com os valores a 60 fps (dobras e pontas dos dedos, pontos das mãos e dos lábios, nível da boca, notas a soar, pads, disparos para as partículas). Nunca passa por estado React.
  - `presets.ts`, `recordingsDb.ts` (IndexedDB), `stageCanvases.ts` (canvas do palco para o compositor de vídeo).
- **`src/ui`**: componentes React que só desenham. Todos os canvas usam um único rAF partilhado (`ui/frame.ts`: `useCanvas`, `useFrame`), que deixa de desenhar canvases fora do ecrã ou de tamanho 0 (exceto os do palco); as luzes do teclado e dos pads mudam o DOM diretamente nesse ciclo.
- **`src/ui/shell/`**: a barra de controlo (`ControlBar`), as gavetas (`Drawer`, `DrawerHost`, sobre `<dialog>`, com o conteúdo só montado enquanto abertas), o menu `MoreMenu`, o seletor de instrumentos (`InstrumentPicker`), o visualizador de ondas (`WaveViz`, sempre na faixa por baixo do palco), o registo de efeitos (`effects.tsx`) e o ecrã inteiro/atalhos (`fullscreen.ts`, `shortcuts.ts`, `useAutoHide.ts`). A lógica pura (pesquisa, recentes, próximo instrumento, migração de preferências, fontes da composição de vídeo) está em `logic.ts`, com testes em `logic.test.ts`.

## Áudio

```
vozes ─► bus ─┬─► seco ─────────┬─► post ─► tom (filtro + drive) ─┬─► master ─► compressor ─► output ─┬─► speakers (mudo) ─► saída
              └─► efeitos boca ─┘                                  ├─► reverb ─┘                         ├─► analisador
                                                                   └─► delay ──┘                         └─► gravação
metrónomo ─────────────────────────────────────────────────────────────────────────────────────────────► speakers
```

- Cada voz regista todos os nós que cria e desliga-os quando termina; o intervalo do arpejo 8-bit limpa-se no mesmo momento. As 10 vozes do theremin são criadas quando se escolhe o theremin e destruídas quando se muda.
- O relógio (`Clock`) segue o padrão "A Tale of Two Clocks": acorda a cada 25 ms e agenda no relógio do `AudioContext` os passos (semicolcheias) dos próximos 100 ms. Metrónomo, quantização e looper partilham esta grelha.
- O looper guarda eventos em passos, não áudio, e decide pela posição no relógio (não pelo estado), porque os passos são agendados antes de soarem.

## Visão

- Os pontos do MediaPipe chegam na imagem original e são espelhados (`x → 1 − x`) à entrada, para as fórmulas do protótipo (lado da mão pelo pulso, colunas do modo movimento) ficarem iguais. O `<video>` é espelhado com CSS e o overlay desenha-se sem espelho.
- `HandLandmarker` e `FaceLandmarker` partilham um `FilesetResolver`, usam o delegate GPU e caem para CPU se falhar. A face corre em fotogramas alternados.
- Os modelos e o WASM vêm de `public/mediapipe/` (sem CDNs) e são pré-carregados pelo service worker.

## PWA

`vite.config.ts` tem um pequeno plugin que gera `dist/sw.js` a partir de `scripts/sw.template.js`, com a lista de ficheiros do build, os modelos e o WASM. Páginas: rede primeiro, cache sem rede; resto: cache primeiro.
