# Energia (como o Star Power) e jogar com uma só mão

No ramo `feat/game-mode`, depois da decisão 72.

**O utilizador pediu:**
- **Jogar com uma só mão:** a outra mão não deve aparecer, para não criar ruído visual.
- **A boca:** no jogo não é precisa, a não ser que sirva para alguma coisa divertida, como o Star Power do Guitar Hero.

Escolheu a energia.

## 1. Energia
- **Barra de energia:** vai de 0 a 1.
  - Cada Perfeito dá `ENERGY_PERFECT` 0,05 e cada Bom `ENERGY_GOOD` 0,025.
  - Toques errados e notas falhadas não tiram energia.
  - Não sobe durante a energia ativa.
- **Ativar:** com a barra a 1 e a música a tocar (`isMusicTime`), abrir a boca ativa a energia:
  - **câmara:** `live.mouth` ≥ `MOUTH_ACTIVATE` 0,6;
  - **teclado:** o espaço, que já faz `live.mouth` 1.
- **Duração:** `POWER_S` 8 s em tempo de áudio. A barra desce de 1 a 0 nesse tempo.
- **Pontos:** durante a energia, cada acerto vale `POWER_MULTIPLIER` 2 vezes os pontos de hoje (com o multiplicador do combo; no máximo ×8).
- **Pausa:** a pausa congela a energia. Na retoma, `powerUntil` desloca-se com o resto (como `hitAt`).
- **Fim da ronda:** a energia ativa acaba.
- **Ao ativar:**
  - toca o prato do kit da ronda (`crashSlotFor(kit)`);
  - durante a energia o reverb sobe `POWER_REVERB_BOOST` 0,3 (limitado a 1), e volta ao valor do jogador quando acaba, na pausa e ao sair.
- **Resultado:** "Energia usada: N vezes" (`powerUses`) quando N > 0.
- **Lógica pura no `GameRun`:**
  - `energy`;
  - `powerUntil`;
  - `powerActive(now)`;
  - `canActivate(now)`;
  - `activatePower(now)`;
  - `powerUses`.
- **`Score.hit(j, offset, mult = 1)`:** recebe o fator da energia.

## 2. A boca no jogo
- **Com o jogo aberto:**
  - a boca **não aplica** o efeito de som do modo livre (`audio.setMouth(…, 'off')`, ou o equivalente que o desligue);
  - a deteção da cara corre mesmo com `mouthFx` `off`, para se poder ativar a energia.
- **No modo livre:** tudo como hoje.

## 3. Interface
- **Na pista (`drawGame`):**
  - **a barra:** uma barra vertical fina, à direita da pista, perto do fundo, na cor `--cyan`. Fica dourada (`#ffd166`) quando está cheia e durante a energia;
  - **barra cheia e energia ainda não ativada:** o texto "Abre a boca!" (pt) / "Open your mouth!" (en), ou "Espaço!"/"Space!" no modo teclado, a pulsar;
  - **com a energia ativa:** a pista e os alvos ganham um brilho dourado, e aparece "×2" junto à pontuação.
- **Uma só mão (`drawOverlay`):**
  - se todos os `game.fingers` forem da mesma mão (todos < 5 ou todos ≥ 5), a outra mão não é desenhada (nem o esqueleto nem os anéis) durante o jogo e a pausa;
  - para saber que mão é qual, usa-se `live.hands` e a atribuição já feita (os dedos 0–4 e 5–9 em `live.fingers`): em vez de desenhar todas as mãos, desenham-se só as pontas e o esqueleto da mão do lado que joga;
  - se a atribuição não for clara, esconde-se pelo menos os anéis dos dedos dessa mão.
- **Textos (pt/en):** `game.powerReady`, `game.powerReadyKey`, `game.powerUses(n)` e `game.powerMult`.

## Testes
- **Unitários:**
  - a energia sobe com Perfeitos e Bons e não sobe com erros nem durante a energia ativa;
  - `canActivate` só com a barra cheia e durante a música;
  - `activatePower` dura 8 s e os pontos dobram;
  - a pausa congela e a retoma desloca;
  - `powerUses` conta as ativações.
- **e2e (modo teclado):**
  - com a energia posta a 1 (diagnóstico) e o espaço premido durante a música, fica ativa e os pontos de um acerto dobram;
  - o resultado mostra "Energia usada";
  - com os dedos só da mão direita, o desenho das mãos não pinta a mão esquerda (verifica-se o estado, com um getter de diagnóstico do lado escondido).

## Decisão
Decisão 73.
