# Vision Sound Cam

Um instrumento musical que se toca com as mãos à frente da webcam. Cada dedo toca uma nota ou um som de percussão; a rapidez com que dobras o dedo define a intensidade, a altura da mão muda o tom e abrir a boca aplica um efeito ao som.

![Demonstração da Vision Sound Cam](docs/demo.gif)

> Tudo corre no navegador. O vídeo da câmara nunca sai do teu computador.

## Como usar

1. Abre a app e carrega em **Ligar câmara e som**. Permite o acesso à câmara.
2. Mostra as duas mãos à câmara, com os dedos esticados.
3. Dobra um dedo para tocar a nota dele. O mindinho esquerdo é a nota mais grave e o mindinho direito a mais aguda. Os polegares estão desligados por defeito (liga-os em **Motor de som → Usar também os polegares**).
4. Quanto mais depressa dobras, mais forte soa. Sobe ou desce a mão para mudar o tom.
5. Abre a boca para aplicar o efeito escolhido no painel **Efeitos** (wah, filtro, distorção, eco, vibrato, robô, tremolo ou expressão).

Sem câmara, toca com o teclado: **A S D F** (mão esquerda) e **J K L Ç** (mão direita); **G** e **H** são os polegares. Segura **Espaço** para simular a boca aberta. O teclado de piano e os pads também se tocam com o rato ou com toque.

### Vistas

- **Som**: vista completa, com instrumentos, visualizadores e efeitos.
- **Música**: foco no teclado de piano, nos pads e no looper.
- **Câmara**: palco em ecrã inteiro, com o mínimo de interface.

### Funcionalidades

- 29 instrumentos: 26 melódicos (teclas, cordas, sopros, lâminas e sintetizadores, incluindo o theremin contínuo) e 3 kits de percussão (acústico, 808 e latino).
- 11 escalas, tónica de Dó a Si e oitava base de 1 a 6.
- Reverb, eco, pitch, filtro e drive em knobs rotativos (arrastar na vertical, roda do rato, setas, duplo clique para repor).
- Metrónomo de 60 a 180 BPM com tap tempo, quantização a 1/8 ou 1/16 e looper de 1, 2 ou 4 compassos com camadas, desfazer e "congelar" no instrumento gravado.
- **GRAVAR** grava o áudio (webm/opus, ou mp4 no Safari) e, se quiseres, também o vídeo com os efeitos visuais. As gravações ficam guardadas no navegador e podem ser ouvidas, descarregadas, partilhadas ou apagadas.
- Predefinições de fábrica ("Piano calmo", "Batida 808", "Theremin espacial", "Coro etéreo") e as tuas, guardadas pelo nome.
- **Calibrar mãos** (nas definições): estica os dedos durante 3 s e depois dobra-os durante 3 s para ajustar os limiares à tua mão.
- Tema escuro e tema claro, respeito por `prefers-reduced-motion`, funciona com teclado e leitores de ecrã.
- Instala-se como app (PWA) e funciona sem internet depois do primeiro carregamento.

Se a deteção das mãos não carregar, a app passa ao **modo movimento**: o ecrã divide-se em colunas, uma por dedo, e toca-se mexendo a mão numa coluna.

## Desenvolvimento

Requer Node 20 ou mais recente.

```bash
npm install
npm run dev          # descarrega os modelos (1.ª vez) e abre em http://localhost:5173
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Verificação de tipos e build de produção para `dist/` |
| `npm run preview` | Serve o build de produção |
| `npm run lint` | ESLint (zero avisos) |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | Teste end-to-end com câmara falsa (Playwright); na 1.ª vez corre `npx playwright install chromium` |
| `npm run fetch-models` | Copia o WASM e descarrega os modelos do MediaPipe para `public/mediapipe/` |

O GIF de demonstração gera-se com `node scripts/make-demo-gif.mjs` (com `npm run dev` a correr).

### Estrutura

```
src/
  app/      App, barra de topo, sessão (câmara → visão → gestos → áudio) e gravação
  state/    store Zustand (preferências persistidas), store transitório a 60 fps, presets, IndexedDB
  vision/   câmara, HandLandmarker, FaceLandmarker, dobra dos dedos, gestos, modo movimento, calibração
  audio/    motor Web Audio, patches, kits, efeitos, teoria, metrónomo, looper, gravação, analisador
  ui/       painéis, palco (overlay, HUD, partículas), teclado, pads, controlos, ícones
docs/       DECISIONS.md, ARCHITECTURE.md
```

`src/vision` e `src/audio` não dependem do React. Mais detalhes em [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e as decisões tomadas em [docs/DECISIONS.md](docs/DECISIONS.md).

### Publicar

O build é estático e usa caminhos relativos, por isso funciona em Vercel, Netlify ou GitHub Pages (incluindo numa subpasta). O `prebuild` descarrega os modelos, por isso o ambiente de build precisa de acesso à internet na primeira vez. A câmara só funciona em `https` ou em `localhost`.

## Navegadores

Testado em Chromium (desktop, com GPU). Nos outros navegadores:

- **Edge**: igual ao Chrome.
- **Firefox**: deve funcionar; a deteção pode cair para CPU e ser mais lenta. A Web Share API com ficheiros não existe no Firefox desktop, por isso "Partilhar" descarrega o ficheiro.
- **Safari** (macOS e iOS 16.4+): as gravações saem em mp4 (`audio/mp4`, `video/mp4`) e a partilha usa a folha de partilha do sistema. No iOS o som só arranca depois de tocar no ecrã e o interruptor de silêncio do iPhone pode cortar o áudio da página. O delegate GPU do MediaPipe pode falhar em alguns iPhones; nesse caso a app usa CPU automaticamente.

## Créditos

Deteção de mãos e face com [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker). Sons sintetizados com a Web Audio API, sem amostras.
