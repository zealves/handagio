# Modo de jogo v2: escolha à entrada, dedos à escolha, pausa e acertos mais fáceis

Continua o protótipo da decisão 67 (spec `2026-10-01-game-mode-design.md`), no mesmo ramo `feat/game-mode`, antes de publicar.

## Objetivo

Depois de jogar com mãos reais, o utilizador quer quatro coisas:
- o jogo mais à vista;
- escolher os dedos que jogam;
- poder pausar;
- acertar com menos frustração.

"A janela de tempo é muito apertada, o alvo é muito pequeno e muitas vezes parece que acerto e não conta como tocado nem soa."

**Decidido com o utilizador:**
1. **Dedos e dificuldade separados.** Escolhes os dedos e as mãos que jogam (de 2 a 8; por exemplo, só a mão direita). O número de faixas é o número de dedos. A dificuldade passa a decidir só o BPM, a densidade e o tempo de chegada. Por defeito ficam os 4 de hoje.
2. **As faixas seguem a posição dos dedos no ecrã**, da esquerda para a direita. Cada faixa fica por cima do dedo que a toca.
3. **As notas e o som vêm do modo livre, como hoje:**
   - o instrumento: uma bateria ou um contínuo passam para o piano;
   - a tónica, a escala e a oitava;
   - a faixa `k` toca o grau `k`.
4. **Acertar mais fácil**, tudo junto:
   - cada dobra numa faixa soa sempre;
   - janelas mais largas, e "Cedo!" ou "Tarde!" sem castigo;
   - notas e alvos maiores;
   - o atraso ajusta-se sozinho.
5. **Ecrã inicial** com dois botões grandes, **Tocar livre** e **Jogar**. Lá dentro, um interruptor **Livre | Jogo** no cabeçalho.
6. **Pausa:**
   - entra-se pelo botão ⏸, pelo `P`, pelo `Esc` ou ao esconder o separador;
   - o cartão tem Continuar, Recomeçar e Sair;
   - ao continuar há uma contagem de 3, 2, 1;
   - o recorde guarda-se normalmente.

**Sucesso:** numa ronda em Fácil com a câmara, a maioria das dobras feitas com intenção conta (Perfeito ou Bom). As que não contam soam na mesma e dizem se foram cedo ou tarde. O atraso médio no fim fica perto de 0 depois de uma ronda.

**Fora (YAGNI):**
- ordem livre das faixas;
- notas próprias do jogo;
- polegares no jogo;
- recorde por combinação de dedos (continua por dificuldade);
- níveis de tolerância à escolha.

## 1. Dedos e dificuldade

- **Preferência nova:** `gameFingers: number[]`, com os índices dos dedos de `fingerMap` (1–4 esquerda, 6–9 direita, sem polegares).
  - Guarda-se pela ordem do ecrã (`SCREEN_ORDER`), de 2 a 8 dedos, sem repetidos.
  - Por defeito `[2, 1, 6, 7]`.
  - O `sanitizePrefs` valida a lista. Se for inválida, ou tiver menos de 2 dedos, volta ao defeito.
- **`DIFFICULTY` perde `fingers`.** Fica `{ bpm, bars, lead }` com os valores de hoje: 90/110/130 BPM, 32/40/48 compassos, 2,4/2,0/1,7 s.
- **O gerador recebe `lanes`** (2–8) em vez de o tirar da dificuldade. O resto do gerador mantém-se: a tónica final é a faixa `l` com `l % scaleSize === 0`, e a faixa 0 existe sempre. Com 2 ou 3 faixas o passeio continua válido. O `spaceLanes` com 2 faixas tem de escolher uma faixa livre de verdade, que é o minor da v1 (`lanes <= 2`), agora alcançável.
- **`laneOf(finger, fingers)`** devolve o índice do dedo em `gameFingers`, ou −1.
- **No cartão de jogo**, um seletor de dedos com as duas mãos lado a lado.
  - Cada mão tem 4 botões (Indicador, Médio, Anelar, Mindinho), com `aria-pressed` e alvos de 44 px.
  - As mãos aparecem como estão no ecrã: a esquerda à esquerda, com o mindinho por fora.
  - Mostra "N faixas".
  - Com 2 dedos escolhidos, os botões desses dedos ficam desativados, com uma dica: "Pelo menos 2 dedos".
- **Etiquetas por baixo dos alvos:** a mão e o dedo, em curto (`E Ind`, `D Méd` / `L Ind`, `R Mid`), quando a faixa tiver ≥ 56 px.
- **Teclado:** as faixas seguem o `KEYMAP` de cada dedo (`a s d f` = esquerda do mindinho ao indicador, `j k l ç` = direita do indicador ao mindinho). O cartão mostra as teclas das faixas escolhidas.

## 2. Acertar mais fácil

- **Cada dobra soa sempre.** Uma dobra (ou tecla) num dedo com faixa toca a nota dessa faixa, acerte ou não, com a mesma voz e a mesma regra de largar de hoje: ao subir o dedo, ou no máximo 1 tempo. Os pontos só dependem do juiz.
- **Janelas novas:**
  - `PERFECT_S` 0,10
  - `GOOD_S` 0,20
  - `NEAR_S` 0,35, novo
- **Toques fora da janela:**
  - Um toque a mais de `GOOD_S`, mas até `NEAR_S` da nota por julgar mais próxima dessa faixa, mostra **"Cedo!"** ou **"Tarde!"**. Não dá pontos, não parte o combo e não gasta a nota.
  - Mais longe é um toque solto, como hoje.
- **Falhado:** como hoje (a nota passa de `GOOD_S` sem toque), agora com a janela nova.
- **Maiores:**
  - **Notas:** 0,86 da largura da faixa (era 0,72), com altura mínima de 10 px.
  - **Alvos:** raio `min(0,42 × faixa, 44 px)` (era `min(0,32 × faixa, 30)`).
  - **Clarão de acerto:** 0,25 s.
- **Atraso que se ajusta sozinho** (só nos toques da câmara; o teclado continua a 0):
  - Cada toque julgado (Perfeito, Bom, Cedo ou Tarde) puxa o atraso da ronda: `lag += LAG_LEARN × offset`, com `LAG_LEARN` 0,15, limitado a `[LAG_MIN_MS, LAG_AUTO_MAX_MS]` = [0, 300] ms. O `offset` é o desvio já com o atraso atual.
  - O juiz e o marcar de falhados usam o atraso atual.
  - No fim da ronda (ou ao sair), com pelo menos `LAG_SAVE_MIN_HITS` (8) toques da câmara, o atraso aprendido guarda-se em `gameLagMs`, arredondado a 10 ms. Assim o slider passa a ser só o ponto de partida.
  - O resultado mostra "Atraso ajustado: X ms" quando mudou.
- **O resultado** continua a mostrar o atraso médio dos acertos.

## 3. Ecrã inicial e interruptor

- **`StartScreen`:** dois botões grandes, lado a lado (um por baixo do outro abaixo de 480 px).
  - **Tocar livre** (`data-testid="start"`, o de hoje): `session.start()`.
  - **Jogar** (`start-game`): `session.start()` e, quando a câmara abrir, `session.openGame()`. Se a câmara falhar, aparece o cartão do erro de hoje e o jogo não abre.
  - Ficam a privacidade, "Sem câmara? Tocar no ecrã" (modo livre no teclado), as teclas e a língua.
- **Cabeçalho:** depois de começar, um interruptor **Livre | Jogo** (`mode-free`, `mode-game`, com `aria-pressed`, 44 px) no lugar do botão do comando.
  - Fica à vista também durante o jogo. Os outros botões continuam escondidos durante o jogo, como hoje.
  - **Jogo**, fora do jogo, abre o cartão (`openGame`).
  - **Livre**, no jogo, sai (`stopGame`).
  - Fica marcado **Jogo** sempre que `game !== null`.
- A 320 px, o interruptor e os botões têm de caber (o teste de layout de hoje passa a incluí-lo).

## 4. Pausa

- **Entrar:**
  - o botão ⏸ ao lado do ✕ (`game-pause`);
  - a tecla `P`;
  - o `Esc` (no jogo, passa a pausar em vez de sair);
  - o `visibilitychange` para escondido, que passa a pausar em vez de acabar.
- **Cartão de pausa:** um `<dialog>` na fase `paused` e três botões:
  - **Continuar** (`game-resume`), também com `Esc` ou `P`;
  - **Recomeçar** (`game-restart`): uma ronda nova com as mesmas escolhas;
  - **Sair** (`game-quit`).
  - Clicar fora continua.
- **Durante a pausa:**
  - a pista congela onde estava;
  - não se agenda acompanhamento;
  - as vozes calam-se (`releaseAll`, que também cancela o que estava agendado);
  - os toques da câmara e do teclado não contam;
  - os falhados não avançam.
- **Sem suspender o `AudioContext`.** O desbloqueio do áudio (`engine.ts`) retoma-o a cada clique ou tecla, e o relógio da app tem de continuar a correr. É a ronda que se desloca no tempo:
  - Ao **pausar**, o `GameRun` guarda o instante (`pausedAt`) e o próximo passo da partitura por tocar (`pRel`, no mínimo 0).
  - Ao **continuar**, escolhe-se o passo de retoma `R` com `gameStartBar(clock, now)` mais um compasso de contagem.
    - O passo `pRel` passa a cair em `R`. O `startStep` muda, e os `times`, `start`, `end`, `judgedAt` e `hitAt` deslocam-se pelo mesmo número inteiro de passos.
    - No compasso antes de `R`, o `onStep` toca os choques da contagem em vez do acompanhamento. O cursor do acompanhamento volta ao primeiro evento com `step ≥ pRel`.
    - As notas aparecem recuadas e voltam a descer durante a contagem. O canvas mostra "3, 2, 1" nos últimos 3 tempos.
  - Pausar durante a contagem inicial também funciona: com `pRel` 0, a ronda recomeça do compasso 1.
- **O recorde** guarda-se normalmente no fim de uma ronda com pausas.
- **Fases do `GameUi`:** `setup | playing | paused | over`. O `GameRun.state` ganha `paused`.

## Arquitetura (o que muda)

- **`src/game/config.ts`:**
  - `DIFFICULTY` sem `fingers`
  - `DEFAULT_GAME_FINGERS` `[2, 1, 6, 7]`, `GAME_FINGER_CHOICES` `[4, 3, 2, 1, 6, 7, 8, 9]`
  - `MIN_GAME_FINGERS` 2
  - `laneOf(finger, fingers)`
  - as janelas novas, `NEAR_S`
  - `LAG_LEARN`, `LAG_AUTO_MAX_MS`, `LAG_SAVE_MIN_HITS`
- **`generator.ts`:** `generateChart({ difficulty, seed, scaleSize, lanes, bars? })`.
- **`judge.ts`:** `press(lane, t)` devolve um destes:
  - `{ kind: 'perfect' | 'good', index, offset }` para um acerto;
  - `{ kind: 'early' | 'late', offset }` para um toque perto, até `NEAR_S`, que não gasta a nota;
  - `null` para um toque solto.
- **`run.ts`:**
  - `press(lane, now, fromCamera)`, que aplica o atraso aprendido
  - `lag` público
  - `cameraHits`
  - `pause(now)`, `resume(R, t0R)` (o passo e o tempo de retoma), `isCountIn(absStep)`
  - `viewNow(now)`, que dá `pausedAt` em pausa
  - `last.kind` também `'early' | 'late'`
- **`session.ts`:**
  - `gamePress` toca sempre a nota da faixa
  - `pauseGame()`, `resumeGame()`, `restartGame()`
  - os toques são ignorados em pausa
  - `finishGame` e `stopGame` guardam o `gameLagMs` aprendido
  - ao esconder o separador, pausa
- **`shortcuts.ts`:** no jogo, `Esc` e `P` alternam a pausa; o resto continua bloqueado.
- **`StartScreen.tsx`:** os dois botões.
- **`TopBar.tsx`:** o interruptor.
- **`GameDialog.tsx`:**
  - o seletor de dedos
  - o cartão de pausa
  - "Atraso ajustado" no resultado
- **`GameTrack.tsx` / `drawGame.ts`:**
  - o botão de pausa
  - os tamanhos novos
  - "Cedo!" e "Tarde!"
  - a vista congelada
  - as etiquetas com a mão
- **Store:**
  - `gameFingers` (preferência, validada)
  - a fase `paused`
- **i18n (pt e en):**
  - os modos, os botões do início, o interruptor, o seletor de dedos, as faixas, "Pelo menos 2 dedos"
  - a pausa, Continuar, Recomeçar
  - Cedo e Tarde
  - "Atraso ajustado"
  - as etiquetas curtas das mãos e dos dedos

## Testes

- **Unitários:**
  - **`generator`:** `lanes` de 2 a 8 (faixas válidas, gaps, a final na tónica), e `spaceLanes` com 2 faixas.
  - **`judge`:**
    - as janelas novas, com os limites;
    - Cedo e Tarde até `NEAR_S`, sem gastar a nota;
    - além disso, `null`.
  - **`run`:**
    - o atraso aprendido (sobe com toques tarde, desce com cedo, fica nos limites, não mexe nos do teclado);
    - `pause` e `resume`: os tempos deslocados por passos inteiros, a contagem na retoma, o acompanhamento a retomar em `pRel` sem repetir eventos, os falhados parados em pausa, a vista congelada;
    - o fim da ronda depois de uma pausa.
  - **`laneOf`.**
  - **`sanitizePrefs`:** `gameFingers` (válido, repetidos, polegares, menos de 2, não-array).
- **e2e:**
  - o botão **Jogar** do início abre o cartão;
  - o interruptor Livre | Jogo;
  - o seletor de dedos: só a mão direita (`j k l ç`) dá 4 faixas e os acertos contam nessas teclas;
  - um toque fora da janela deixa uma voz a soar;
  - pausa com `P`, `Esc` e o botão: o cartão aparece e a pontuação e as notas não mudam durante a pausa;
  - Continuar: os acertos voltam a contar;
  - esconder o separador pausa (e já não sai);
  - Recomeçar;
  - o layout a 320 px com o interruptor.

## Decisão a registar

Decisão 68 em `docs/DECISIONS.md`:
- as quatro mudanças;
- o porquê das janelas e de soar sempre;
- o atraso aprendido;
- a pausa sem suspender o áudio;
- o `Esc` passa a pausar;
- o recorde continua por dificuldade.

E uma entrada 3.3.0 atualizada no CHANGELOG, ainda não publicada.

## Riscos

- **O atraso aprendido pode derivar** se o jogador tocar sistematicamente tarde por estilo. Fica limitado a 300 ms e aprende devagar (0,15). O slider permite repor.
- **Soar sempre pode tornar a mistura confusa** com muitos toques soltos. Mitigação: os toques soltos são raros com as janelas largas. A nota é sempre da escala e do instrumento escolhido.
- **A deslocação na pausa** toca em vários tempos ao mesmo tempo. Tem testes unitários dedicados, e o e2e confirma que se continua a acertar.
