# Vision Sound Cam

Instrumento musical controlado pela webcam: dobrar um dedo toca uma nota, abrir a boca aplica um efeito. Vite + React 18 + TypeScript estrito, Zustand, MediaPipe `tasks-vision`, Web Audio nativa (sem Tone.js). Interface em português de Portugal.

## Comandos

- `npm run dev` — servidor de desenvolvimento (corre `fetch-models` antes)
- `npm run build` — `tsc -b` + build Vite para `dist/`
- `npm run lint` — ESLint, zero avisos
- `npm test` — Vitest (lógica pura em `src/**/*.test.ts`)
- `npm run test:e2e` — Playwright com câmara falsa
- `npm run fetch-models` — copia o WASM e descarrega os modelos para `public/mediapipe/`

## Regras

- `src/vision` e `src/audio` não importam React.
- Valores a 60 fps nunca vão para estado React: usar `src/state/live.ts` e desenhar em canvas.
- Fórmulas e valores de deteção/som vêm de `reference/maos-musicais.html`; não aproximar.
- Decisões ambíguas ficam em `docs/DECISIONS.md`.
- Um commit por fase; antes de cada commit: `npm run build && npm run lint && npm test`.
