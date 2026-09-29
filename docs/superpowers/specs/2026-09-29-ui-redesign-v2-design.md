# Redesenho da interface — v2.0.0

Data: 2026-09-29 · Ramo: `redesign/v2` · Base: `v1.0.0`

## Objetivo

Simplificar a interface para pôr o foco em tocar, sem perder nenhuma função. Hoje há três colunas com 11 painéis e três separadores (Som / Música / Câmara) que pouco mudam. A v2 pede:

- **palco da câmara em primeiro plano**, com só as opções mais importantes à vista;
- **opções e configurações completas**, mas arrumadas em gavetas, no menu ⋯ e nas Definições;
- **ecrã inteiro** e **esconder interface**;
- **bom funcionamento em várias resoluções**, do telemóvel ao desktop, em retrato e paisagem;
- **melhor desempenho**: menos canvases a desenhar a cada fotograma;
- **preparação para muitos mais sons** (o catálogo cresce; a forma de tocar continua igual);
- **um visualizador único e bonito** (as ondas sobrepostas) e um **modo sem imagem da pessoa**.

### Fora do âmbito

- Sons e efeitos de áudio novos. A UI fica pronta para os receber: um som é um patch novo e um efeito é uma entrada em `EFFECTS` mais o nó no motor.
- Alterações à lógica de sessão, visão, áudio, looper, quantização, gravação ou presets, além das referidas em "Alterações fora da UI".
- Novas formas de tocar.

## Estrutura do ecrã

```
┌──────────────────────────────────────────────────────┐
│ ● Vision Sound Cam                    ⛶  🔇  ⚙      │  cabeçalho fino
│                                                      │
│              PALCO (proporção da câmara,             │
│              ajustado à largura e à altura)          │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │🎹 Piano│Dó Pentat.│◔Rev ◔Eco ✦│♩120│👁│⏺▾│⟳│ ⋯ │ │  barra de controlo
│ └──────────────────────────────────────────────────┘ │
│ ≈≈≈≈≈≈≈≈≈≈≈ faixa de ondas (opcional) ≈≈≈≈≈≈≈≈≈≈≈≈≈≈ │
└──────────────────────────────────────────────────────┘
```

- **Cabeçalho:** logótipo; ecrã inteiro (⛶), silenciar e Definições (⚙). Saem os botões partilhar e descarregar da última gravação, que passam para a gaveta Gravações.
- **Barra de controlo** (`ControlBar`), sobre o fundo do palco, por esta ordem:
  1. chip **Instrumento** (ícone e nome) → gaveta Instrumentos;
  2. chip **Escala** ("Dó · Pentatónica") → gaveta Escala e acordes;
  3. **mini-knobs Reverb e Eco** (só ≥ 1100 px) e ✦ → gaveta Efeitos;
  4. chip **Tempo** ("♩ 120", com um ponto aceso quando o metrónomo está ligado) → gaveta Tempo e looper;
  5. **👁 Fundo do palco**: alterna Câmara → Só mãos → Ondas (menu com os 3 quando há espaço);
  6. **⏺ Gravar**: começa e para a gravação; o **▾** abre a gaveta Gravações;
  7. **⟳ Looper**: botão com o estado atual do looper (mesma ação do botão principal do `LooperPanel`);
  8. **⋯ Mais**: menu com todas as gavetas, incluindo Tocar com o rato, e "Esconder interface".
- **Faixa de ondas** (`WaveViz`), com ~60 px de altura, colada por baixo do palco. Aparece só com o fundo Câmara, com largura ≥ 1100 px e com `showWaves` ligado (é o valor por defeito).
- **Estado:** o HUD já mostra nota, tempo, voz, motor e fps. Do antigo `StatusPanel` falta só o looper, que passa a um chip no HUD quando o estado não é `idle`.

## Fundo do palco (`stageBg`)

| Valor | Palco | Gravação de vídeo |
|---|---|---|
| `camara` | vídeo em espelho, mãos neon e partículas (como hoje) | vídeo, mãos, partículas e HUD |
| `maos` | fundo escuro, mãos neon e partículas; `<video>` com `opacity: 0` (não `display:none`: no iOS o vídeo escondido deixa de entregar fotogramas) | fundo escuro, mãos, partículas e HUD (a pessoa não aparece) |
| `ondas` | `WaveViz` em grande ao centro, mãos a 60% de opacidade, partículas | fundo escuro, ondas, mãos, partículas e HUD |

A câmara e a deteção continuam ativas nos três modos. O vídeo gravado segue sempre o que se vê: é a regra de privacidade.


### Alteração pedida durante a implementação (fundo por defeito)

O utilizador quer ver as mãos, não a si próprio. Por isso:

- `stageBg` começa em `maos`. A ordem passa a Só mãos → Ondas → Câmara.
- O botão 👁 da barra alterna só entre `maos` e `ondas`; a partir de `camara`, volta a `maos`.
- A Câmara fica como opção escondida: no menu ⋯ (grupo "Fundo do palco", em último lugar) e nas Definições, com o toggle "Mostrar a imagem da câmara" na secção Câmara (ligado = `camara`, desligado = `maos`).
- A migração da v1 passa sempre para `maos`, porque na v1 a câmara era o valor por defeito e não se distingue quem a escolheu.
- A faixa de ondas por baixo do palco aparece com os fundos `maos` e `camara` (≥ 1100 px, `showWaves`); com `ondas` não aparece, porque as ondas já ocupam o palco.

## Gavetas

Componente `Drawer`, feito sobre `<dialog>` com `showModal()`, o que dá de forma nativa o foco preso, o Esc e o `inert` no resto da página: no desktop e no tablet é lateral direita, sobreposta ao palco (o palco não encolhe); no telemóvel é uma folha inferior até 70% da altura. Só pode haver uma aberta de cada vez (`drawer: DrawerId | null`). Fecha com Esc, com um clique fora ou com o botão ×. Usa `role="dialog"`, `aria-modal="true"`, foco preso e o resto da página `inert`, e o foco volta ao controlo que a abriu. **O conteúdo só é montado enquanto a gaveta está aberta.**

| `DrawerId` | Título | Conteúdo |
|---|---|---|
| `instrumentos` | Instrumentos | `InstrumentPicker` (novo) |
| `escala` | Escala e acordes | `ScalePanel`, sem alterações de lógica |
| `efeitos` | Efeitos | cartões gerados a partir de `EFFECTS`: Reverb, Eco, Pitch, Filtro, Drive e Boca |
| `tempo` | Tempo e looper | `TempoPanel` e `LooperPanel` |
| `gravacoes` | Gravações | `RecordPanel`, mais descarregar e partilhar a última gravação |
| `rato` | Tocar com o rato | `PianoKeyboard`, `DrumPads` |

### Registo de efeitos

`src/ui/shell/effects.tsx` exporta `EFFECTS: EffectDef[]`, onde `EffectDef = { id, label, quick: boolean, render: () => ReactNode }`. `quick` indica se o efeito aparece como mini-knob na barra (Reverb e Eco). O `EffectsPanel` atual, com duas páginas, é substituído por uma lista de cartões, e os controlos usam as mesmas chaves do store.

### Seletor de instrumentos (`InstrumentPicker`)

- Campo de **pesquisa** com foco ao abrir. Ignora acentos e maiúsculas e procura no nome, na família e na descrição.
- Secção **Recentes**: até 6, a partir de `recentInstruments`. Fica escondida durante a pesquisa.
- **Chips de família** numa linha com scroll horizontal (mantém `familyFilter`).
- **Grupos por família** com cabeçalho e contagem. Cada **fila compacta** tem ícone, nome e uma linha de descrição truncada, com `aria-pressed` no instrumento ativo.
- Setas ↑ e ↓ movem o foco e Enter ou clique escolhe. A gaveta fica aberta para se poder experimentar. Na barra, `,` e `.` passam ao instrumento anterior ou seguinte.
- Estado vazio: "Nenhum instrumento encontrado."

### Definições (⚙)

Juntam-se às atuais (presets, câmara, mãos/calibração, volume, tema):

- vindas do Sound Maker: oitava base, altura da mão muda o tom, deslizar o tom e sensibilidade da visão;
- "Mostrar ondas por baixo do palco" (`showWaves`);
- lista de atalhos: `I` esconder interface, `E` ecrã inteiro, `,` e `.` instrumento anterior e seguinte, Esc fechar, e os atalhos que já existem (Espaço, teclas das notas A–L e Ç);
- sai "Mostrar a imagem da câmara", que passa a ser o `stageBg` na barra.

## Ecrã inteiro e esconder interface

- `useFullscreen()`: `requestFullscreen` no elemento da app e `E` alterna. Onde a API não existe (iOS Safari), o botão ativa só "esconder interface".
- `uiHidden` (tecla `I`, ou ⋯ → Esconder interface): esconde o cabeçalho, a barra e a faixa, e ficam o palco e o HUD.
- `useAutoHide()`: com `uiHidden`, mover o rato ou tocar no ecrã mostra a barra durante 3 s. Com a câmara ligada e sem `uiHidden`, a barra nunca se esconde sozinha.
- **Teclas:** `H` e `F` estão ocupadas pelas notas (A S D F G H J K L Ç) e, no teclado português, `[` e `]` só saem com AltGr, que os atalhos ignoram. Por isso ficam `I`, `E`, `,` e `.`, que estão livres e não precisam de modificador.
- Os atalhos são ignorados em campos de texto, seletores, knobs e sliders, pela mesma regra da tecla Espaço (decisão 14).

## Resoluções

| Condição | Barra | Gaveta | Faixa de ondas |
|---|---|---|---|
| largura ≥ 1100 px | chips com texto e mini-knobs | lateral, 360 px | sim (se `showWaves`) |
| 600–1099 px | chips com texto curto, sem mini-knobs | lateral, 320 px | não |
| < 600 px | só ícones, com Instrumento, Escala, ⏺, ⟳ e ⋯ (o resto vai para ⋯), abaixo do palco | folha inferior | não |
| altura < 500 px e paisagem | vertical, à direita do palco | lateral, 320 px | não |

- O palco ajusta-se ao espaço livre (`min(largura, altura disponível × ar)`), mantém a proporção da câmara e não faz scroll de página em nenhum destes casos.
- Não pode haver scroll horizontal em nenhuma largura ≥ 320 px.
- Alvos de toque de pelo menos 40×40 px abaixo de 1100 px.

## Estado (Zustand)

- **Sai:** `view` (e o tipo `View`).
- **Runtime, novos:** `drawer: DrawerId | null`, `uiHidden: boolean`.
- **Preferências, novas:** `stageBg: 'camara' | 'maos' | 'ondas'` (por defeito `camara`), `showWaves: boolean` (por defeito `true`), `recentInstruments: string[]` (por defeito `[]`).
- **Preferências, sai:** `showVideo`.
- **Migração** `persist` da versão 1 para a 2: `showVideo === false` passa a `stageBg: 'maos'`, caso contrário `'camara'`; remove `showVideo`; os campos novos recebem os valores por defeito.
- `recentInstruments` é atualizado sempre que `instrument` muda, venha a mudança da UI, de um preset ou de `[`/`]`.

## Alterações fora da UI

- `app/recording.ts`: passa `video` ao compositor só quando `stageBg === 'camara'`; nos outros modos o compositor já pinta só o fundo escuro. Com `ondas`, as camadas começam por `stageCanvases.waves`, registado pelo `WaveViz` do palco. `audio/recorder.ts` não muda.
- `state/stageCanvases.ts`: novo campo `waves`.
- `ui/frame.ts`: `useCanvas` deixa de desenhar quando o canvas está fora do ecrã (`IntersectionObserver`) ou tem tamanho 0.
- `?debug`: a sobreposição mostra os FPS do rAF partilhado e o tempo médio de um fotograma.

## Componentes

**Novos** em `src/ui/shell/`: `ControlBar`, `Drawer`, `DrawerHost`, `MoreMenu`, `InstrumentPicker`, `WaveViz`, `effects.tsx`, `useFullscreen`, `useAutoHide`, `useShortcuts`, `logic.ts`. Novo `src/lib/keys.ts` com `isTypingTarget`, partilhado com `session.installKeyboard`.

**Removidos:** `ui/controls/Tabs.tsx`, `ui/panels/VisualizerPanel.tsx`, `ui/panels/SoundMakerPanel.tsx`, `ui/panels/StatusPanel.tsx`, `ui/panels/InstrumentSelect.tsx`, `ui/panels/EffectsPanel.tsx` (o conteúdo passa para `effects.tsx`), `ui/bottom/BottomStrip.tsx` e `ui/bottom/WaveformStrip.tsx` (substituído pelo `WaveViz`). Antes de apagar cada ficheiro, confirmo que nada o importa.

**Alterados:** `App.tsx` e `App.module.css` (layout novo), `TopBar.tsx` (sem separadores nem partilhar/descarregar), `CameraStage.tsx` (fundo do palco, sem a moldura com "dots"), `HudOverlay.tsx` (linha de estado), `SettingsDialog.tsx` e `session.installKeyboard` (atalhos `H`, `F`, `[`, `]`, Esc).

## Lógica pura (`src/ui/shell/logic.ts`, com testes)

- `pushRecent(list, id, max = 6)`: põe `id` no início, sem duplicados, com no máximo `max` entradas.
- `normalize(s)` e `searchInstruments(query, list)`: filtram sem distinguir acentos nem maiúsculas.
- `nextInstrument(id, dir, filter)`: dá a volta nos dois sentidos e respeita `familyFilter` quando não é "Todos".
- `migratePrefs(old, version)`: a migração descrita acima.
- `nextStageBg(bg)`: roda Câmara → Só mãos → Ondas.

## Desempenho

- **Meta:** com a UI por defeito, câmara ligada e nenhuma gaveta aberta, no máximo 3 canvases desenhados por fotograma (overlay, partículas, faixa de ondas). Os knobs são SVG e não contam. A v1 desenha 10.
- **Medição:** `scripts/perf-probe.mjs` mede durante 15 s, dentro da página, os FPS do rAF, o intervalo p95 e o número de canvases visíveis. Corre na v1 (tag `v1.0.0`) e na v2, na mesma máquina. Os números ficam registados em `DECISIONS.md`.

## Testes

- **Vitest:** todas as funções de `logic.ts`.
- **e2e (`e2e/app.spec.ts`):**
  - o fluxo atual adaptado: ligar a câmara, abrir Instrumentos, pesquisar, escolher cada instrumento, tocar e gravar;
  - novos casos:
    - trocar o fundo para `maos` e confirmar que o `<video>` não está visível e que a deteção continua;
    - `I` esconde a barra;
    - uma só gaveta aberta de cada vez;
    - Esc fecha a gaveta e o foco volta ao chip;
    - em 1440×900, 1024×768, 390×844 e 844×390: não há scroll horizontal, o palco está visível e a barra está visível;
  - o caso offline mantém-se.
- `data-testid` existentes (`tile-*`, `instruments`, `scale-panel`, `looper`, `recordings`, `stage`, `video`) mantêm-se onde fizer sentido. O `tile-*` passa para as filas do seletor.

## Documentação e versão

- `docs/DECISIONS.md`: novas entradas numeradas a partir da 33, com o layout, o fundo do palco, o registo de efeitos, o seletor, a migração e os números de desempenho. A 30 (separadores) e a 31 (revisão do layout adiada) ficam marcadas como substituídas.
- `CHANGELOG.md`: secção `[2.0.0]`.
- `README.md` e `docs/ARCHITECTURE.md` atualizados; `CLAUDE.md` também, se o resumo da arquitetura mudar.
- `docs/demo.gif` regenerado.
- Fim: merge para `main`, `chore: release v2.0.0` (versão no `package.json`) e tag anotada `v2.0.0`.

## Simplificação final

- O fundo do palco foi removido (botão 👁, menu ⋯ e Definições): esta secção substitui as secções do fundo do palco acima.
- As mãos aparecem sempre: a câmara só alimenta a deteção e não aparece no palco nem na gravação.
- As ondas estão sempre na faixa por baixo do palco, em todos os layouts, e desenham-se sem sombras nem alocações por fotograma.
