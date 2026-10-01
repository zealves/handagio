# Modo de jogo: pista ao estilo Guitar Hero (protótipo)

## Objetivo

Um modo de jogo para **diversão**, para **testar o conceito**: as notas descem por uma pista de faixas, uma por dedo, e o jogador dobra o dedo certo quando a nota chega à linha de impacto. Acertar toca a nota da melodia no instrumento escolhido, por cima de um acompanhamento automático (bateria e baixo). Cada partida é uma ronda de ~90 s com pontuação.

**Decidido com o utilizador:**
- Diversão, estilo Guitar Hero (não é um modo de aprendizagem).
- Música **procedural** primeiro; mais tarde músicas a sério (MIDI, curadas ou geradas na hora). Por isso a partitura é um formato próprio, separado do gerador.
- Visual **A: pista** de faixas desenhada por cima da câmara.
- **Dificuldade escolhida no início**: Fácil 4 faixas, Médio 6, Difícil 8.
- **Tu tocas a melodia**: o acompanhamento toca sozinho; cada acerto toca a nota da partitura.
- **Ronda com tempo fixo** (~90 s), com pontuação, precisão, combo máximo e recorde.
- Abordagem **A**: módulo `src/game/` ligado à sessão atual.

**Sucesso do protótipo:** uma pessoa com a câmara consegue jogar uma ronda em Fácil do princípio ao fim, sente que os acertos contam no tempo certo e quer jogar outra vez.

**Fora do protótipo (YAGNI):** músicas curadas ou MIDI, notas longas (para segurar), acordes de dois dedos, polegares, papel especial da boca, pausa, gravar o jogo em vídeo, tabelas online.

## Jogabilidade

### Faixas

As faixas seguem a ordem do ecrã (`SCREEN_ORDER`), sem polegares, da esquerda para a direita:

| Dificuldade | Faixas | Dedos (índice da app)                                    | BPM | Compassos | Duração |
| ----------- | ------ | -------------------------------------------------------- | --- | --------- | ------- |
| Fácil       | 4      | médio e indicador esq. (2, 1), indicador e médio dir. (6, 7) | 90  | 32        | ~85 s   |
| Médio       | 6      | + anelares (3 … 8)                                        | 110 | 40        | ~87 s   |
| Difícil     | 8      | + mindinhos (4 … 9)                                       | 130 | 48        | ~89 s   |

A faixa `k` (0 = a mais à esquerda) toca o grau `k` da escala atual (tónica e escala do jogador, oitava base do jogador): a pista sobe da esquerda para a direita, como o instrumento com a tónica no mindinho esquerdo. O som é o instrumento atual se for melódico; se for uma bateria ou um contínuo, a melodia usa o `piano`. Os acordes, a altura do pulso e as notas personalizadas não se aplicam no jogo: cada acerto é uma nota.

### Partida

1. **Entrada:** o botão **Jogar** (ícone de comando) no cabeçalho abre o cartão de jogo, um `<dialog>` sobre o palco com a dificuldade (3 botões), o recorde de cada uma, o ajuste do atraso e **Começar**. Também funciona no modo teclado (as teclas `a s d f` / `h j k l` já são dedos), o que serve para quem não tem câmara e para os testes.
2. **Contagem:** um compasso de entrada (choques nos 4 tempos e "3, 2, 1" no ecrã). As notas já estão a descer durante a contagem.
3. **Jogo:** as notas descem durante o tempo de chegada (Fácil 2,4 s, Médio 2,0 s, Difícil 1,7 s) até à linha de impacto, perto do fundo.
4. **Fim:** depois do último compasso aparece o cartão de resultado com a pontuação, a precisão (%), o combo máximo, Perfeito / Bom / Falhado, o atraso médio dos acertos ("tocas em média 40 ms tarde") e "Novo recorde!" quando é o caso. Os botões são **Jogar outra vez** e **Sair**.
5. **Sair a meio:** ✕ no canto ou `Esc`. Esconder o separador também termina a partida, sem guardar o recorde.

Durante o jogo escondem-se o Dock (pills, dicas, tira dos acordes, teclado tátil) e a folha, e o seletor de instrumentos não abre (`releaseAll` cortaria o acompanhamento agendado). O metrónomo e o looper ficam calados. O efeito da boca continua a funcionar sobre a mistura.

### Juiz

- O instante do toque é `audio.now − atraso`. O **atraso** compensa a câmara e a deteção. Por defeito é `GAME_INPUT_LAG_MS` (120 ms, a afinar com mãos reais) e ajusta-se no cartão de jogo (0–250 ms, passos de 10). O valor fica guardado. No modo teclado o atraso é 0.
- Um toque numa faixa procura a nota mais antiga ainda por julgar nessa faixa e mede `|toque − nota|`:
  - até `PERFECT_S` (0,07 s): **Perfeito**
  - até `GOOD_S` (0,15 s): **Bom**
  - mais longe: o toque é ignorado
- **Falhado:** uma nota que passa mais de `GOOD_S` da linha sem toque.
- **Toques soltos** (fora da janela ou num dedo sem faixa) não tocam nada e não penalizam. A deteção ainda dispara às vezes com o dedo vizinho, e castigar isso seria frustrante.
- Um acerto toca a nota da partitura **logo** (sem quantizar), com a duração da partitura (no máximo 1 tempo); larga mais cedo se o dedo subir. Um falhado não toca nada; a nota fica vermelha e desvanece.

### Pontuação

- Perfeito 100 e Bom 50, vezes o multiplicador: ×1, ×2 a partir de 10 seguidos, ×3 a partir de 20, ×4 a partir de 30.
- Um falhado põe o combo a 0. Os toques soltos não mexem no combo.
- Precisão = (Perfeito + 0,5 × Bom) / total de notas.
- O recorde guarda-se por dificuldade.

## Música procedural

`generateChart({ difficulty, seed })` é puro e determinístico (RNG com semente; cada partida usa uma semente nova). Devolve uma `Chart`, o formato que mais tarde um leitor de MIDI também produzirá:

```ts
interface Chart {
  bpm: number;
  bars: number;            // sem o compasso de entrada
  lanes: number;           // 4, 6 ou 8
  notes: ChartNote[];      // ordenadas por step
  backing: BackingEvent[]; // ordenados por step
}
interface ChartNote { step: number; lane: number; dur: number }   // step = 1/16, a partir do compasso 1 (depois da entrada)
type BackingEvent =
  | { step: number; kind: 'drum'; slot: number; vel: number }       // kit acústico: 0 bombo, 1 tarola, 2 choques
  | { step: number; kind: 'bass'; degree: number; dur: number; vel: number };
```

- **Harmonia:** uma progressão de 4 compassos em graus da escala, repetida: `[0, 5, 3, 4]` nas escalas de 7 notas e `[0, 3, 2, 4]` nas de 5 ou menos, com o grau limitado ao tamanho da escala.
- **Forma:** frases de 2 compassos, organizadas em secções de 8 compassos A A' B A (A' é A com o fim alterado), para soar a uma canção e dar padrões que se aprendem.
- **Ritmo da melodia:** células de 1 tempo escolhidas por dificuldade. Fácil: semínimas e pausas. Médio: com colcheias. Difícil: mais colcheias e síncopas. Não há semicolcheias: a câmara a 30 fps não as distingue. Gaps mínimos: entre notas seguidas, 1 colcheia (Médio, Difícil) ou 1 semínima (Fácil); na mesma faixa, 1 semínima (o dedo tem de subir e voltar a dobrar).
- **Alturas:** um passeio pelas faixas com passos de ±1 na maioria e saltos de 2–3 às vezes. No tempo 1 de cada compasso a nota tende para uma nota do acorde que estiver nas faixas.
- **Densidade crescente:** a primeira secção é mais esparsa e a última mais cheia.
- **Acompanhamento:** bombo nos tempos 1 e 3, tarola no 2 e no 4, choques em colcheias (em Fácil, em semínimas); o compasso de entrada leva só os choques. O baixo toca a fundamental do acorde em colcheias nos tempos 1 e 3, uma oitava abaixo da melodia, no instrumento `bass`.

## Arquitetura

### `src/game/` (sem React, lógica pura e testável)

| Ficheiro       | Responsabilidade                                                                              |
| -------------- | --------------------------------------------------------------------------------------------- |
| `types.ts`     | `Difficulty`, `Chart`, `ChartNote`, `BackingEvent`, `Judgement`, `GameResult`                 |
| `config.ts`    | Constantes com nome e comentário: faixas, BPM, compassos, tempo de chegada, janelas, pontos  |
| `rng.ts`       | RNG pequeno com semente (mulberry32)                                                          |
| `generator.ts` | `generateChart({ difficulty, seed, scaleSize })`                                              |
| `judge.ts`     | `Judge`: `press(lane, t) → Judgement \| null`, `sweep(t) → ChartNote[]` (falhados), `done`     |
| `score.ts`     | `Score`: `add(j)`, `miss()`, `combo`, `multiplier`, `points`, `result()`; atraso médio dos acertos |
| `run.ts`       | `GameRun`: liga a partitura ao relógio, ao juiz e à pontuação (ver abaixo)                    |

**`GameRun`** recebe dependências injetadas (como o `Clock`), por isso testa-se sem áudio:

```ts
new GameRun(chart, {
  playBacking(ev, when),            // bateria e baixo (a melodia dos acertos toca-a a sessão)
  lag,                              // segundos
}, startStep)                       // step do relógio onde começa o compasso de entrada
run.onStep(absStep, time)           // agenda o acompanhamento desse step
run.press(lane, now)                // → Judgement | null
run.update(now)                     // falhados, fim da ronda
run.state                           // 'countdown' | 'playing' | 'over'
```

O tempo de cada nota é `clock.anchor + (startStep + 16 + note.step) × stepDur`, em tempo de áudio.

### Ligação à sessão (`src/app/session.ts`)

A sessão só encaminha; a lógica fica no `GameRun`.
- `session.startGame(difficulty)`:
  - garante o áudio
  - gera a partitura com uma semente nova
  - cria o `GameRun` no próximo início de compasso (`clock.nextBarTime`)
  - publica `live.game`
  - põe `game.phase` no store
- `fingerOn(i, …)`: com uma partida a correr, converte o dedo na faixa (`laneOf(i, difficulty)`) e chama `run.press` com o mesmo `when` que o resto da sessão usa. Se acertar, toca a nota com `playNote` e o `voiceKey` habitual, para o `fingerOff` largar a nota. Volta sempre sem tocar a nota livre.
- `onStep`: com uma partida a correr, chama `run.onStep` e salta o metrónomo e o looper.
- `tick`: chama `run.update(audio.now)`. No fim, passa o resultado para o store e guarda o recorde.
- `session.stopGame()`: larga as vozes do jogo e limpa o `live.game`.

### Estado

- **`live.game`** (60 fps, lido pelo canvas): a partitura, os tempos das notas, o estado de cada nota (por julgar, perfeito, bom ou falhado, com o instante), a pontuação, o combo, o multiplicador, a contagem e os clarões de cada faixa.
- **Store, em tempo de execução** (não persistido): `game: null | { phase: 'setup' | 'playing' | 'over', difficulty, result? }`.
- **Store, persistido** (`version` 10, com migração e validação em `sanitizePrefs`): `gameBest: { easy, medium, hard }` (pontos), `gameDifficulty` e `gameLagMs`. Nenhum destes entra nos `SoundSettings`.

### Interface (`src/ui/game/`)

- `GameTrack.tsx`: um canvas novo dentro de `.stage` (`CameraStage.tsx`), por cima do `HandOverlay`, desenhado com `useCanvas`. Desenha:
  - a pista em perspetiva (o trapézio vai estreitando para o topo)
  - as faixas, com a cor de cada dedo (`theme.ts`)
  - as notas a descer, com a posição calculada a partir de `audio.now`
  - a linha de impacto
  - os clarões de Perfeito e Bom
  - a pontuação, o combo e o multiplicador
  - a contagem
  - por baixo de cada faixa, uma etiqueta com o dedo dessa faixa

  As faixas da mão esquerda ficam na metade esquerda.
- `GameDialog.tsx`: o cartão de entrada e o de resultado (`<dialog>`), com React, a partir de `game.phase`.
- O botão **Jogar** no `TopBar` aparece depois de começar.
- Os textos vão para `pt.ts` e `en.ts` (`game.*`): os nomes das dificuldades, os juízos, o resultado e o atraso.

## Testes

- **Unitários (Vitest):**
  - `generator`:
    - a mesma semente dá a mesma partitura
    - as faixas ficam em `[0, lanes)`
    - os gaps mínimos são respeitados (global e por faixa)
    - não há notas antes do compasso 1 nem depois do fim
    - a densidade sobe de secção para secção
    - o acompanhamento é coerente com a dificuldade
    - as escalas de 5 notas funcionam
  - `judge`:
    - as janelas de Perfeito e Bom, com os limites incluídos
    - um toque julga só uma nota
    - o toque escolhe a nota mais antiga da faixa
    - os falhados aparecem com o `sweep`
    - os toques soltos dão `null`
  - `score`: o multiplicador, o combo, a precisão e o atraso médio
  - `run`:
    - os tempos das notas
    - o acompanhamento agendado só uma vez por step
    - o fim da ronda
    - o atraso descontado
  - `laneOf`
  - a migração v10 das preferências
- **e2e (Playwright, modo teclado):**
  - abrir o cartão e começar em Fácil
  - em debug, `__vsc.session` dá os tempos das notas; o teste prime as teclas certas a tempo e confirma acertos e pontuação maior que 0
  - sair com `Esc`
  - uma ronda curta em debug (`__vsc.game.bars`) chega ao cartão de resultado e guarda o recorde
- Antes do commit: `npm run build && npm run lint && npm test`.

## Decisões a registar

Decisão 67 em `docs/DECISIONS.md`:
- o porquê das faixas, dos BPM e das janelas
- os toques soltos sem castigo
- o atraso por defeito e o ajuste
- a ausência de semicolcheias
- a melodia em `piano` quando o instrumento não é melódico
- o formato `Chart`, separado do gerador, a pensar no MIDI e nas músicas curadas

## Riscos

- **Latência da câmara:** é o maior risco do conceito. O atraso médio no resultado e o ajuste servem para o medir e afinar com mãos reais.
- **Dedos acoplados** (o anelar e o mindinho): mitigado com a dificuldade (Fácil usa só os indicadores e os médios) e com os toques soltos sem castigo.
- **Desempenho:** mais um canvas a 60 fps; a pista desenha só as notas dentro do tempo de chegada.
