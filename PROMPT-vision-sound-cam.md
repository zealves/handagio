# Prompt: Vision Sound Cam — instrumento musical controlado pela câmara

> Como usar: coloca este ficheiro na raiz do repo e, ao lado, cria uma pasta `reference/` com:
>
> - `reference/mockup.webp`: o print do design de referência;
> - `reference/maos-musicais.html`: a versão atual da app (protótipo num só ficheiro).
>
> Depois abre o Claude Code no repo e escreve: **"Lê PROMPT-vision-sound-cam.md e executa-o fase a fase."**

---

## 1. Papel e objetivo

És um engenheiro sénior de frontend e áudio. Vais construir de raiz, neste repositório vazio, uma app web chamada **Vision Sound Cam**. É um instrumento musical que se toca com as mãos à frente da webcam: cada dedo toca uma nota ou um som de percussão, a força e o movimento do dedo mudam a intensidade e o tom, e abrir a boca aplica um efeito ao som.

O visual e a disposição seguem o mockup em `reference/mockup.png`. A lógica de deteção e o motor de som já existem, testados, em `reference/maos-musicais.html`. **Porta essa lógica para uma arquitetura modular, não a reinventes.** Lê os dois ficheiros por inteiro antes de escrever código.

Trabalha de forma autónoma. Não me faças perguntas, a não ser que estejas realmente bloqueado (por exemplo, falta uma credencial). Quando houver uma decisão ambígua, escolhe a opção mais sensata, regista-a em `docs/DECISIONS.md` e continua.

Toda a interface fica em **português de Portugal** ("ecrã", "gravar", "definições", "tónica").

---

## 2. Stack técnica

- **Vite + React 18 + TypeScript**, em modo estrito.
- **Zustand** para o estado global (instrumento, escala, efeitos, gravação, etc.).
- **@mediapipe/tasks-vision** com `HandLandmarker` e `FaceLandmarker`, no modo `VIDEO`, com delegate GPU e fallback para CPU.
  - Descarrega os modelos (`hand_landmarker.task` e `face_landmarker.task`) e os ficheiros WASM para `public/mediapipe/`, para a app funcionar sem depender de CDNs. Cria um script `npm run fetch-models` que faz esse download.
  - Usa um único `FilesetResolver` partilhado pelos dois modelos.
- **Web Audio API nativa** para o motor de som. Não uses Tone.js: o protótipo já tem os sintetizadores feitos à mão e é para os manter.
- **CSS Modules** ou CSS simples com variáveis (design tokens). Sem Tailwind.
- **Vitest** para testes unitários da lógica pura e **Playwright** para um teste end-to-end com câmara falsa (`--use-fake-device-for-media-stream`).
- ESLint + Prettier.
- Estrutura pensada para correr como PWA estática (deploy em Vercel, Netlify ou GitHub Pages).

---

## 3. Arquitetura e pastas

```
src/
  app/                 App.tsx, layout principal, providers
  state/               store.ts (Zustand), tipos globais
  vision/
    camera.ts          getUserMedia, escolha de câmara, erros traduzidos
    handTracker.ts     HandLandmarker: ciclo de deteção, atribuição esquerda/direita
    faceTracker.ts     FaceLandmarker: abertura da boca
    fingerCurl.ts      cálculo de dobra por dedo (funções puras, testadas)
    gestureEngine.ts   histerese, velocidade, disparo e libertação de notas
    motionFallback.ts  modo por colunas quando a deteção não carrega
  audio/
    engine.ts          AudioContext, bus, master, compressor, envios
    patches/           um ficheiro por família: keys.ts, strings.ts, winds.ts, mallets.ts, synths.ts
    drums/             kits: acoustic.ts, tr808.ts, latin.ts
    effects/           reverb, delay, mouthFx (wah, filtro, distorção, eco, vibrato, robô, tremolo, expressão), pitchShift
    theory.ts          escalas, graus, midi↔frequência, nomes das notas em pt
    metronome.ts       relógio com agendamento antecipado (lookahead)
    recorder.ts        gravação de áudio e de vídeo
    looper.ts          looper de 4 compassos sincronizado com o metrónomo
    analyser.ts        AnalyserNode partilhado pelos visualizadores
  ui/
    panels/            SoundMakerPanel, InstrumentSelect, StatusPanel, VisualizerPanel, EffectsPanel, RecordPanel
    stage/             CameraStage, HudOverlay, HandOverlay (canvas), ParticleWave
    bottom/            PianoKeyboard, DrumPads, WaveformStrip
    controls/          Knob, Slider, Toggle, IconButton, Tabs
    icons/             ícones SVG próprios dos instrumentos
  styles/              tokens.css, global.css
docs/
  DECISIONS.md
  ARCHITECTURE.md
CLAUDE.md              resumo do projeto e comandos, para sessões futuras
```

Regras de arquitetura:

- A lógica de visão e de áudio **não importa React**. São módulos TypeScript puros, testáveis, que comunicam por eventos tipados. Por exemplo, `gestureEngine` emite `noteOn(fingerId, velocity, pitchShift)`, `noteOff(fingerId)` e `continuous(fingerId, level, pitch)`.
- A deteção corre num ciclo `requestAnimationFrame` próprio, separado do render da interface. O React não pode re-renderizar a 60 fps: os overlays desenham diretamente num `<canvas>` e os valores de alta frequência vivem em refs ou num store transitório, não em estado React.
- O vídeo é um elemento `<video>` real, em espelho com `transform: scaleX(-1)`. O canvas de overlay fica por cima com as mesmas dimensões e a mesma proporção da câmara, para os pontos ficarem alinhados com as mãos.

---

## 4. Funcionalidades a portar do protótipo (obrigatórias)

Copia os valores e as fórmulas de `reference/maos-musicais.html`. Não os aproximes.

### 4.1 Deteção dos dedos

- Até 2 mãos. A mão da esquerda do ecrã é a esquerda do utilizador, porque a imagem está em espelho. Com duas mãos, atribui o lado pela posição x do pulso; com uma só, usa o lado do ecrã em que está.
- A dobra de cada dedo (0 = esticado, 1 = dobrado) combina 60% dos ângulos nas articulações PIP e DIP com 40% da distância da ponta ao pulso, normalizada pelo tamanho da palma (distância do landmark 0 ao 9).
- O polegar tem fórmula própria, mas **fica desligado por defeito**. Há uma opção "Usar também os polegares". Sem polegares tocam 8 dedos; com polegares, 10.
- Suavização da dobra: `curl = curl*0.35 + novo*0.65`. A velocidade é a derivada suavizada da dobra.
- Histerese: dispara quando `curl > limiar` e `velocidade > 0.3`; liberta quando `curl < limiar − 0.18`. O limiar vem da sensibilidade: `limiar = 0.75 − sens*0.45`.
- A velocidade no disparo define a intensidade da nota (0.2 a 1).

### 4.2 Notas e tom

- Disposição de piano: o mindinho esquerdo é a nota mais grave e o mindinho direito a mais aguda, com graus da escala seguidos, sem saltos.
- A altura do pulso desloca a nota em graus da escala no momento do disparo (opção "Altura da mão muda o tom").
- Nos sons sustentados, mover a mão enquanto seguras a nota faz o tom deslizar (opção "Deslizar o tom").
- Escalas: Maior, Menor, Pentatónica, Pentatónica menor, Blues, Dórica, Frígia, Árabe, Japonesa, Tons inteiros, Cromática. Tónica de Dó a Si, com nomes em português. Oitava base de 1 a 6.

### 4.3 Motor de som

- Os 26 patches melódicos do protótipo, organizados em famílias: Teclas, Cordas, Sopros, Lâminas e Sintetizadores. Inclui o Theremin, que é contínuo: a dobra controla o volume e a altura faz o tom deslizar.
- Os 3 kits de percussão: acústico, 808 e latino. Com 8 dedos, usam os 8 primeiros sons de cada kit.
- Cada patch declara `sustain`, `release`, `length` e `ring`. Mantém o "kit" de funções auxiliares do protótipo (`osc`, `filt`, `hit`, `adsr`, `lfo`, `noise`, `buffer`).
- Guitarra, harpa e cravo usam Karplus-Strong, com cache dos buffers.
- Cadeia de saída: vozes → bus → seco + efeitos da boca → post → master → compressor → saída, com envios de reverb (resposta a impulso gerada) e de delay a partir do post.

### 4.4 Boca

- Abertura da boca: distância entre os landmarks 13 e 14 a dividir pela distância entre 61 e 291, mapeada com `clamp((r − 0.08)/0.45, 0, 1)` e suavizada.
- Efeitos à escolha: Wah, Filtro, Distorção, Eco espacial, Vibrato, Voz de robô, Tremolo, Expressão (só soa com a boca aberta) e Nenhum. Com a boca fechada o som fica normal, exceto nos modos Filtro e Expressão.
- A tecla Espaço simula a boca aberta.
- Desenha o contorno dos lábios no overlay e mostra um medidor da abertura no painel.

### 4.5 Alternativas quando algo falha

- Se a deteção das mãos não carregar em 20 s, ou não devolver resultados em 6 s, ativa o **modo movimento**: o ecrã divide-se em colunas, uma por dedo, com deteção por diferença entre fotogramas.
- **Modo teclado**: A S D F para os dedos da mão esquerda e J K L Ç para os da direita (G e H são os polegares, quando ativos).
- Erros da câmara com mensagens claras em português: permissão negada, câmara não encontrada, câmara em uso noutra app.

---

## 5. Funcionalidades novas, inspiradas no mockup

### 5.1 Layout (ver `reference/mockup.png`)

Três colunas em desktop, com uma barra de topo:

- **Topo:**
  - À esquerda, logótipo próprio (não copies o do mockup) e o nome "Vision Sound Cam".
  - Ao centro, separadores em forma de pílula com ícones: **Som** (vista completa), **Música** (foco no teclado, nos pads e no looper) e **Câmara** (palco em ecrã inteiro, com o mínimo de interface).
  - À direita, botões de partilhar, descarregar a última gravação, mudo e definições.
- **Coluna esquerda:**
  - Painel "Sound Maker" com o espectro em tempo real.
  - Linha "Motor de som" que abre as definições de escala, tónica e oitava.
  - Slider "Sensibilidade da visão".
  - Grelha **"Seleção de instrumento"**, 3×2 visível e com scroll para o resto: uma tile por instrumento, com ícone SVG próprio (piano, bateria, guitarra elétrica, guitarra acústica, tarola, violino, flauta, sintetizador, etc.). A tile ativa tem um contorno néon. Há filtros por família.
  - Por baixo, um painel de estado: nota atual, tempo em BPM, voz atual e estado da gravação.
- **Centro, palco da câmara:**
  - Moldura estilo janela com o título "Vision Sound Cam".
  - HUD translúcido com chips de "Nota", "Tempo" e "Voz", e um indicador REC vermelho a piscar quando está a gravar.
  - Esqueleto das mãos com traço néon em gradiente ciano → magenta, com brilho (glow). Anéis luminosos nas pontas dos dedos, com a cor do dedo, que crescem com a dobra e emitem uma onda ao disparar, com o nome da nota por cima.
  - **Onda de partículas** na parte inferior do palco: uma fita de partículas que ondula ao ritmo da forma de onda do analisador e dispara partículas a partir de cada nota tocada.
- **Faixa inferior do palco:**
  - **Teclado de piano** com 2 a 3 oitavas, que ilumina as teclas das notas tocadas e permite tocar com o rato ou com toque.
  - **8 pads de percussão** (2×4), iluminados quando disparam, clicáveis e mapeados para o kit atual.
  - **Forma de onda** estilo gravador, em gradiente multicolor.
- **Coluna direita:**
  - "Visualizador": barras de espectro com gradiente arco-íris.
  - "Analisador dinâmico": várias linhas de onda sobrepostas.
  - "Osciloscópio dinâmico".
  - Painel **"Efeitos"** com knobs rotativos (arrastar na vertical, roda do rato, teclado, duplo clique para repor o valor inicial) em 2 páginas com indicadores de página:
    - página 1: Reverb, Eco, Pitch;
    - página 2: Filtro, Drive, Efeito da boca (seletor).
  - Por baixo, o botão grande **GRAVAR**, com contorno em gradiente.

Em ecrãs estreitos (menos de 1100 px) passa para uma coluna: palco no topo e painéis em acordeão por baixo. No telemóvel o palco ocupa a largura toda e o teclado e os pads fazem scroll horizontal.

### 5.2 Tempo, metrónomo e quantização

- Tempo de 60 a 180 BPM, com tap tempo.
- Metrónomo com som próprio e agendamento antecipado (padrão "tale of two clocks").
- Opção de **quantizar** os disparos a 1/8 ou 1/16. As notas disparadas pelos dedos esperam pela próxima subdivisão; isto aplica-se sobretudo à percussão.

### 5.3 Looper

- Grava um loop de 1, 2 ou 4 compassos sincronizado com o metrónomo e toca-o em repetição.
- Permite sobrepor camadas (overdub), desfazer a última camada e limpar.
- Grava eventos de notas, e não áudio, para o loop acompanhar mudanças de instrumento se o utilizador quiser. Há uma opção para "congelar" o loop no instrumento com que foi gravado.

### 5.4 Gravação

- **GRAVAR** grava o áudio master com `MediaStreamAudioDestinationNode` e `MediaRecorder` (webm/opus, com alternativa mp4 no Safari).
- Opção "Gravar também vídeo": compõe num canvas escondido o vídeo da câmara em espelho mais os overlays, e grava `canvas.captureStream()` junto com o áudio.
- Lista de gravações da sessão, com reprodução, descarga e apagar. Guarda em IndexedDB para não se perderem ao recarregar a página.
- O botão partilhar usa a Web Share API com o ficheiro, se o navegador a suportar; senão, descarrega o ficheiro.

### 5.5 Definições e predefinições

- Guarda em `localStorage` as preferências: instrumento, escala, tónica, oitava, efeitos, sensibilidade, polegares, câmara escolhida.
- Predefinições ("presets") que o utilizador pode guardar e carregar pelo nome, com 4 de fábrica: "Piano calmo", "Batida 808", "Theremin espacial" e "Coro etéreo".
- Escolha da câmara, se houver várias, e opção de baixar a resolução para computadores mais fracos.
- Calibração: botão "Calibrar mãos", que pede para esticar e dobrar os dedos durante 3 s e ajusta os limiares de cada utilizador.

---

## 6. Design visual

- **Estilo:** estúdio noturno. Fundo azul-marinho muito escuro (≈ `#0b1020`), painéis em vidro fosco (`backdrop-filter: blur`) com um contorno fino e translúcido, cantos de 16 a 20 px.
- **Acentos néon:** ciano (≈ `#35e0ff`), azul elétrico, violeta e magenta (≈ `#ff4fd8`). Os gradientes vão sempre do ciano ao magenta. O vermelho é só para REC.
- **Cores dos dedos:** 10 cores distintas e estáveis, reutilizadas nos anéis do overlay, nas teclas iluminadas e nas partículas.
- **Tipografia:** uma sans geométrica para títulos de painel, em versaletes com espaçamento largo (por exemplo "Sora" ou "Space Grotesk"), uma sans legível para o texto ("Inter") e números tabulares no HUD. Carrega as fontes localmente com `@fontsource`.
- **Animação:** 60 fps nos canvas. Na interface, transições curtas (150 a 250 ms). Respeita `prefers-reduced-motion`: sem partículas e glows mais discretos.
- **Tema:** o escuro é o principal. Inclui um tema claro utilizável, com os mesmos tokens redefinidos.
- **Identidade própria:** não copies logótipos, fotografias nem texto do mockup. Usa apenas a disposição, a hierarquia e o ambiente.

---

## 7. Qualidade e desempenho

- Deteção das mãos a pelo menos 25 fps num portátil médio. A deteção da face corre em fotogramas alternados.
- Latência do gesto ao som inferior a 50 ms. Usa `latencyHint: "interactive"`.
- Sem fugas de memória: os osciladores param sempre, os nós desligam-se e os intervalos (arpejo 8-bit) limpam-se no stop. Testa isto com o desenvolvimento a correr durante 10 minutos.
- O `AudioContext` só arranca depois de um gesto do utilizador (ecrã inicial "Ligar câmara e som").
- Acessibilidade: todos os controlos funcionam com teclado, com labels e `aria-*`, knobs com `role="slider"` e foco sempre visível. Nunca uses só a cor para transmitir informação: as notas têm sempre o nome escrito.
- Privacidade: nada sai do navegador. O vídeo nunca é enviado para lado nenhum. Diz isto no ecrã inicial.

### Testes mínimos

- **Vitest:**
  - `theory.ts`: graus, nomes das notas, frequências.
  - `fingerCurl.ts`: com landmarks sintéticos de mão aberta e mão fechada.
  - `gestureEngine.ts`: histerese e velocidade; não pode disparar duas vezes sem libertar.
  - Mapeamento de dedos com e sem polegares.
  - Quantização.
- **Playwright:** com câmara falsa, carrega a app, clica "Ligar câmara e som", confirma que o `<video>` tem `videoWidth > 0`, muda de instrumento em todas as tiles, toca pelo teclado e pelos pads, grava 2 s e confirma que aparece uma gravação na lista. O teste falha se houver erros na consola.

---

## 8. Plano por fases

Faz um commit por fase, com uma mensagem clara. No fim de cada fase corre `npm run build`, `npm run lint` e `npm test`, e corrige o que falhar antes de avançar. Atualiza o `CLAUDE.md` com os comandos e as decisões principais.

1. **Base:** Vite + React + TS, lint, testes, tokens de design, layout das três colunas com painéis vazios e o ecrã inicial. Script `fetch-models`.
2. **Câmara e visão:** câmara, HandLandmarker, `fingerCurl`, `gestureEngine` e overlay do esqueleto com anéis néon. Modo movimento e erros traduzidos. Testes unitários da visão.
3. **Motor de som:** porta todos os patches e kits do protótipo, a teoria musical e a cadeia de efeitos. Liga os eventos dos gestos ao áudio e acrescenta o modo teclado.
4. **Interface do mockup:** seleção de instrumentos com ícones, HUD, teclado de piano, pads, knobs, visualizadores (espectro, analisador, osciloscópio, forma de onda) e onda de partículas.
5. **Boca:** FaceLandmarker, efeitos da boca, medidor e contorno dos lábios.
6. **Tempo:** metrónomo, tap tempo, quantização e looper.
7. **Gravação:** áudio, vídeo composto, lista em IndexedDB, descarregar e partilhar.
8. **Acabamento:** presets, calibração, definições persistentes, tema claro, `prefers-reduced-motion`, responsividade para telemóvel, PWA (manifest e service worker com cache dos modelos), teste Playwright e README em português com instruções e GIF de demonstração.

---

## 9. Critérios de aceitação finais

- [ ] Abre com `npm run dev`, pede a câmara e mostra o vídeo em espelho em menos de 3 s.
- [ ] Com as mãos à frente, 8 dedos disparam notas com intensidade variável e o polegar não faz nada, por defeito.
- [ ] Pelo menos 29 instrumentos selecionáveis na grelha, com ícones, e 3 kits de percussão.
- [ ] Abrir a boca aplica o efeito escolhido de forma progressiva.
- [ ] Teclado de piano, pads e forma de onda reagem em tempo real ao que se toca.
- [ ] Metrónomo, quantização e looper funcionam em sincronia.
- [ ] GRAVAR produz um ficheiro de áudio (e de vídeo, se ativo) que se pode descarregar e reproduzir.
- [ ] Funciona sem internet depois do primeiro carregamento.
- [ ] Build, lint e todos os testes passam sem avisos.

Quando terminares, escreve um resumo curto do que foi feito, do que ficou por fazer e de qualquer limitação conhecida (por exemplo, diferenças no Safari).
