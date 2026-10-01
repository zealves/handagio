# Redesign v3 — menus, botões e fluxos para telemóvel e tablet

Data: 2026-10-01 · Estado: aprovado em conversa · Ponto de partida: `handagio-redesign-spec.md` (estudo de design) e os prints do protótipo.

## Objetivo

Arrumar e simplificar a interface com revelação progressiva, pensada primeiro para o telemóvel (375 px) e o tablet, sem perder nenhuma funcionalidade. O desktop continua a funcionar e mantém os atalhos.

**Prioridade das tarefas:** 1) tocar, 2) mudar o som, 3) gravar/partilhar, 4) afinar a fundo. A interface dá peso visual por esta ordem.

**Não muda:** o desenho das mãos e das notas (overlay neon, cores dos dedos, nome do acorde na mão), as ondas e as partículas, o áudio, a deteção, os atalhos existentes (`A`…`Ç`, `Espaço`, `,` `.`, `C`, `I`, `E`, `Esc`), os temas e os tokens de cor atuais. Os tokens oklch do estudo de design não entram.

## Abordagem

Troca-se só a estrutura de navegação, e os painéis atuais passam a conteúdo das tabs. Saem `TopBar` (redesenhada), `ControlBar`, `MoreMenu`, `ChordColumn`, `EffectsFooter`, `Drawer`/`DrawerHost` e `EffectsDrawer`. Entram `Header`, `Hud`, `PillBar`, `ChordStrip`, `Sheet` (com `SheetHost`), `Coach`, `Notice` e `TouchKeys`. Os painéis `InstrumentPicker`, `ScalePanel`, `effects.tsx`, `TempoPanel`, `LooperPanel` e `RecordPanel` mantêm a lógica e mudam de estilo. `session`, `audio`, `vision`, `HandOverlay`, `ParticleWave` e `WaveViz` não mudam por dentro.

## Estados do ecrã

### 1. Início (antes da câmara)
- O cabeçalho tem só o logótipo (Handagio · Vision Sound Cam).
- Ao centro fica um botão circular ▶ de 80 px, com a cor de destaque e brilho, e o texto **Começar** por baixo.
- Mais abaixo, em texto discreto: "🔒 O vídeo fica no teu dispositivo", o link **Sem câmara? Tocar no ecrã** e, só em `(hover: hover)`, a linha dos atalhos de teclado.
- **Começar** liga o áudio e pede a câmara.
- Se a câmara falhar, aparece um cartão no palco, "Sem acesso à câmara" com a mensagem do erro, e dois botões: **Tentar outra vez** e **Tocar no ecrã**.
- **Tocar no ecrã** arranca sem câmara (`engine: 'keyboard'`) e mostra o teclado tátil.

### 2. A tocar
- **Cabeçalho:** logótipo à esquerda. À direita: ⌨ Teclado tátil, ⛶ Ecrã inteiro (escondido abaixo de 640 px), ● Gravar e ⚙ Definições.
- **HUD** (canto superior esquerdo do palco):
  - o chip `NOTA: …`;
  - por baixo, só quando há atividade: `REC 0:12`, o chip do looper (é um botão que abre o Estúdio), `📷 Ligar câmara` no modo sem câmara, e o FPS e o modo de deteção se "Mostrar FPS" estiver ligado.
  - Saem os chips Tempo e Voz.
- **Ondas:** a faixa `WaveViz` passa para dentro do palco, no fundo e por trás das pills.
- **Pills** (em baixo, ao centro):
  - `Instrumento` abre a tab Som;
  - `Tónica · Escala` (ou "Notas personalizadas") abre a tab Notas;
  - `[desenho do acorde]` abre a tira de acordes.
  - Um swipe para cima na zona das pills abre a sheet na última tab.
- **Tira de acordes** (`ChordStrip`):
  - Tem os 7 modos (desenho + rótulo curto), num `radiogroup` com setas.
  - **No telemóvel:** abre a pedido por cima das pills; escolher um modo fecha-a, tal como tocar fora ou `Esc`. A descrição do modo aparece por um instante.
  - **Em ecrãs largos** (`min-width: 1024px` e `min-height: 600px`): fica sempre aberta por cima das pills e a pill do acorde desaparece. É a substituta da coluna "Cada dedo toca…".
- **Dicas** (coach) por cima das pills, uma de cada vez. As mensagens de estado (`status`) têm prioridade e usam o mesmo sítio.
- **Teclado tátil:** fica encostado ao fundo do palco, com as pills por cima dele. Mostra o piano nos instrumentos melódicos e os pads nos de percussão.
- **Esconder interface (`I`):** como hoje, ficam só o palco e o HUD. Mexer ou tocar mostra o resto durante 3 s.

### 3. Sheet de configuração
- Tem 4 tabs: **Som**, **Notas**, **Efeitos** e **Estúdio**.
- É um `<dialog>` aberto com `.show()` (não modal): o palco continua vivo e não há fundo escuro. Não prende o foco, de propósito (decisão 64).
- **Em baixo** (retrato ou largura abaixo de 640 px):
  - pega de 32×4 px numa faixa arrastável de 24 px;
  - altura de 45 dvh, que expande para 85 dvh ao arrastar para cima; arrastar para baixo fecha;
  - largura máxima de 640 px, centrada (tablet em retrato).
- **À direita** (paisagem a partir de 640 px de largura, e desktop): painel de 360 px **por cima** do palco, com `glass-strong` e blur, e um ✕ para fechar. O palco nunca muda de tamanho.
- **Fecha com:** tocar fora (exceto nos elementos `data-sheet-keep`, como as pills), `Esc` ou ✕. O foco volta a quem a abriu.
- **Tabs:** `role="tablist"`, com `←`/`→` entre tabs. Os atalhos `1`–`4` abrem cada tab, ou fecham a sheet se essa tab já estiver aberta. A última tab fica lembrada durante a sessão. Cada pill abre a sua tab.
- **Teclado com a sheet aberta:** os atalhos das notas e o `Espaço` continuam ativos. `I` e `E` não mexem na interface (como com as gavetas).
- Com `prefers-reduced-motion`, a sheet aparece sem deslizar.

### Conteúdo das tabs

**Som**
- **Sons guardados:** pills com as predefinições de fábrica e as do utilizador. Tocar numa carrega-a logo, e fica marcada a que coincide com o som atual. Os sons do utilizador têm um ✕ com confirmação por segundo toque. **+ Guardar** abre um campo inline para o nome.
- **Instrumentos:** chips de família (Todos, Teclas, Cordas, Sopros, Lâminas, Sintetizadores, Percussão) e uma grelha de cartões (ícone + nome, pelo menos 88 px). Em "Todos", a grelha tem um título por família.
- **Pesquisa:** campo à vista com apontador fino; atrás de 🔍 no toque.
- Os estados de carregamento e de erro das amostras aparecem no cartão.

**Notas**
- Segmentado "As notas vêm da: Escala | Personalizadas".
- **Modo Escala:**
  - tónica em 12 pills com scroll horizontal;
  - escala com 5 pills à vista (Maior, Menor, Pentatónica, Blues, Menor harmónica), mais a ativa se não for uma destas, e **+ mais** expande os grupos completos;
  - "Tónica no: Mindinho esq. | Indicador dir.".
- **Modo Personalizadas:** o editor atual (dedos, grelha de notas, Copiar da escala).
- **Cada dedo toca…:** grelha de 7 cartões com o `ChordGlyph` e a descrição do modo ativo sempre à vista. Os modos são independentes de Escala/Personalizadas.
- **Os teus dedos tocam:** a pré-visualização por dedo (as notas dos dedos que já existem, com o nome do acorde).
- **Oitava base:** pills de 1 a 6 (sai das ⚙).

**Efeitos**
- **Efeito da boca:** pills, medidor e explicação ("Segura Espaço para simular"), no topo.
- **Knobs:** Reverb, Eco, Filtro, Drive e Pitch (56 px), em grelha.
- **Repor efeitos:** volta aos valores de fábrica dos 5 knobs e do efeito da boca, com confirmação por segundo toque.

**Estúdio**
- Os painéis Tempo, Looper e Gravações tal como estão (com estilo novo), incluindo "Gravar também vídeo".
- Ao parar uma gravação, aparece o aviso "Gravação guardada · Ver", que abre o Estúdio.

### 4. Definições (⚙)
- `<dialog>` modal: ecrã inteiro abaixo de 640 px (com "← Voltar"), modal de 560 px acima disso.
- **Mãos:** calibrar, repor, sensibilidade da visão, usar os polegares (+ a sensibilidade deles), aprender a mão (+ as barras), a altura da mão escolhe a nota, arrastar a nota.
- **Câmara:** escolher a câmara, baixar a resolução.
- **Som:** volume e silenciar.
- **Aspeto:** tema, esconder a interface, mostrar FPS.
- **Atalhos** (só com `pointer: fine`), **Créditos dos sons** e **Repor as preferências**.
- Saem as Predefinições (passam a Som) e a Oitava base (passa a Notas).

## Estado (store)
- `drawer: DrawerId | null` passa a `sheet: SheetTab | null` (runtime) e `sheetTab: SheetTab` (última tab, runtime). `SheetTab = 'som' | 'notas' | 'efeitos' | 'estudio'`.
- Novos campos runtime: `chordStrip: boolean`, `touchKeys: boolean`, `cameraError: string | null`, `notice: { text: string; tab?: SheetTab } | null`.
- Novas preferências: `showFps: boolean` (false) e `coachDone: CoachId[]` ([]). Não é preciso migração, porque o `merge` preenche os valores por defeito.
- Sai `engineOpen` (não é usado).

## Dicas (coach)
- Lógica pura em `logic.ts`: `coachStep(ctx)` devolve `'hands' | 'bend' | 'mouth' | 'touch' | null`.
  - `hands`: com `engine === 'hands'` e sem mãos vistas desde o arranque.
  - `bend`: até à primeira nota.
  - `mouth`: depois de 5 notas, até à primeira boca aberta; só com `faceState === 'ok'`.
  - `touch`: com `engine === 'keyboard'`, até à primeira nota.
- Cada dica que se cumpre entra em `coachDone`. O ✕ marca todas.
- Não aparecem com a sheet aberta, com uma mensagem de estado ou com a interface escondida.

## Toque e acessibilidade
- Alvos de pelo menos 44×44 px abaixo de 1024 px. `safe-area-inset` no cabeçalho, nas pills e na sheet.
- Rótulos `aria` em todos os botões de ícone; `tablist`/`tab`/`tabpanel` na sheet; `radiogroup` nos modos, nas escalas, nas tónicas e nas oitavas.
- Contraste verificado no tema claro.

## Testes
- **Vitest:** `coachStep`, `visibleScales`, `presetMatches`, `tabForKey` e o resto da lógica nova em `logic.ts`. Saem os testes de `DRAWER_*`.
- **Playwright:**
  - `app.spec.ts` é reescrito para a nova navegação, mantendo os cenários funcionais.
  - Projetos `mobile` (375×812, toque) e `tablet` (820×1180, toque), que correm os testes marcados com `@mobile` e `@tablet`: layout sem scroll horizontal, a sheet abre e fecha, alvos de pelo menos 44 px, a tira de acordes, o fluxo sem câmara.
- **No fim:** `npm run build && npm run lint && npm test && npm run test:e2e`, regenerar `docs/demo.gif` e verificar no Chrome nos três tamanhos.

## Entrega
Ramo `redesign-v3`, com commits por fase: estado e lógica → cabeçalho, HUD e pills → sheet e tabs → tira de acordes → início, dicas e aviso → definições → e2e e documentação. Sai como v3.0.0. Sem push até o utilizador pedir.
