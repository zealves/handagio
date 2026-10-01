# Handagio

Vision Sound Cam: instrumento musical controlado pela webcam. Dobrar um dedo toca uma nota, abrir a boca aplica um efeito. Vite + React 18 + TypeScript estrito, Zustand, MediaPipe `tasks-vision`, Web Audio nativa (sem Tone.js). Interface em português de Portugal.

## Comandos

- `npm run dev` — servidor de desenvolvimento (corre `fetch-models` antes)
- `npm run build` — `tsc -b` + build Vite para `dist/` (gera também `dist/sw.js`)
- `npm run lint` — ESLint, zero avisos
- `npm test` — Vitest (lógica pura em `src/**/*.test.ts`)
- `npm run test:e2e` — Playwright com câmara falsa (Chromium completo com GPU; faz build + preview)
- `npm run fetch-models` — copia o WASM e descarrega os modelos para `public/mediapipe/` (gitignored)
- `npm run prepare-samples` — descarrega, corta e comprime as amostras dos instrumentos gravados para `public/samples/` (corre à mão; o resultado vai para o git)
- `node scripts/make-demo-gif.mjs` — regenera `docs/demo.gif` (precisa de `npm run dev`)
- `node scripts/make-icons.mjs` — regenera os PNG da PWA a partir de `public/icon.svg`

## Arquitetura (resumo)

- `src/app/session.ts` orquestra tudo (sem React): câmara → `HandTracker`/`FaceTracker` → `GestureEngine` → `AudioEngine`, com o seu próprio rAF. Também tem o modo teclado, o relógio, a quantização, o looper e a calibração.
- `src/state/store.ts` (Zustand, `persist`) guarda preferências e estado de baixa frequência. `src/state/live.ts` guarda valores a 60 fps lidos pelos canvas.
- `src/ui/frame.ts` tem um único rAF partilhado por todos os canvas (`useCanvas`, `useFrame`).
- `src/ui/shell/` tem o fundo do palco (`Dock`: mensagens, dicas, tira `ChordStrip`, pills, teclado tátil), a folha de configuração (`Sheet`, `<dialog>` não modal com 4 tabs, conteúdo só montado quando aberta), o seletor de instrumentos, os sons guardados, o registo de efeitos e os atalhos (`I`, `E`, `,`, `.`, `C`, `1`–`4`); a lógica pura está em `logic.ts` e as media queries partilhadas em `media.ts`.
- Pontos do MediaPipe convertidos para espelho (`x → 1 − x`) à entrada; o overlay não é espelhado.
- Diagnóstico: com `?debug` (ou em dev) existe `window.__vsc` com `session`, `audio`, `live`, `store` e `syntheticHand`; `session.feedHands()` injeta mãos no pipeline real (usado no e2e e no GIF).

## Regras

- `src/vision` e `src/audio` não importam React.
- Valores a 60 fps nunca vão para estado React: usar `live` e desenhar em canvas.
- Fórmulas e valores dos sons sintetizados vêm de `reference/maos-musicais.html`; não aproximar. A deteção dos dedos partiu do protótipo mas foi afinada na v2.2 (suavização, limiares por dedo, disparo antecipado, período refratário e aprendizagem da mão; decisão 62 em `docs/DECISIONS.md`); as suas constantes estão nomeadas e comentadas em `src/vision/gestureEngine.ts` e `src/vision/adaptive.ts`. Os instrumentos acústicos usam amostras em `public/samples/` (ver `CREDITS.md`); `npm run prepare-samples` regenera-as.
- Decisões ambíguas ficam em `docs/DECISIONS.md` (numeradas).
- Antes de cada commit: `npm run build && npm run lint && npm test`.
- Commits em inglês, no formato Conventional Commits (`feat: …`, `fix: …`, `ci: …`, `docs: …`, `chore: …`), assunto no imperativo, minúsculas, sem ponto final, até ~72 caracteres; corpo opcional com bullets. Autor único: José Alves, sem `Co-Authored-By` nem outras linhas de atribuição.
- Deploy: `.github/workflows/deploy.yml` envia `dist/` por FTP para `handagio.com/` (addon domain) a cada push para `main`. Nunca usar `public_html/`, que é o site do zalves.com. Nomes do workflow e dos passos em inglês.
- Sem `alert`/`confirm`: confirmações por segundo clique; diálogos com `<dialog>`.
