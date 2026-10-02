# Modo de jogo v3: notas rápidas possíveis, menu do jogo e seletor com as mãos

Continua as v1 e v2 (decisões 67 e 68), no ramo `feat/game-mode`, antes de publicar. O feedback do utilizador depois de jogar foi:
- "Selecionar dedos não está intuitivo; deve aparecer como as 2 mãos."
- "Quando faço pausa e Sair vai logo para o modo livre; falta ir para o home do jogo (jogar outra vez ou mudar de dificuldade)."
- "Nas notas rápidas é difícil acertar."

**Fora (projetos à parte, mais tarde):** mais músicas, progresso, login opcional, monetização. O menu do jogo fica pronto para receber uma lista de músicas por cima da dificuldade, mas sem a fazer agora.

## 1. Notas rápidas possíveis para a câmara

Um toque na câmara precisa de ~250–300 ms: dobrar, a confirmação em 2–3 imagens a 30 fps, esticar e voltar a dobrar. As colcheias de hoje ficam a ~230 ms no Difícil e a ~270 ms no Médio.

- **Intervalo mínimo:** `MIN_NOTE_GAP_S` = 0,30 s entre quaisquer duas notas, em todas as dificuldades.
  - O gerador converte-o em passos: `ceil(0,30 / stepDur)`. Isso dá 2 passos no Fácil e 3 no Médio e no Difícil.
  - Depois de montar as notas, remove as que ficam a menos desse intervalo da anterior.
  - Fica sempre a primeira nota e nunca se remove a nota final.
- **Mãos alternadas:** duas notas seguidas a menos de 1 tempo (4 passos) vão para mãos diferentes, quando a escolha tem dedos nas duas mãos.
  - O gerador recebe `split`, o número de faixas da mão esquerda. As faixas `[0, split)` são da esquerda e `[split, lanes)` da direita.
  - Se a nota estiver na mesma mão que a anterior, muda para a faixa mais próxima da outra mão.
  - Com uma só mão (`split` 0 ou `lanes`), não muda nada.
  - Corre antes do `spaceLanes`, que continua a garantir 1 tempo entre notas na mesma faixa e a final na tónica.
- **"Dobras vistas tarde":** a pontuação conta os toques da câmara que dão "Tarde!" (`lateTaps`). O resultado mostra "Dobras vistas tarde: N" quando N > 0. Serve para perceber se o problema é o tempo ou a deteção.
- Os invariantes do gerador de hoje mantêm-se:
  - faixas válidas;
  - nenhuma nota antes do compasso 1;
  - a final na tónica;
  - a densidade a subir;
  - os gaps.

## 2. Menu do jogo

- O cartão de entrada passa a ser o **menu do jogo**. Tem a dificuldade, os dedos, o recorde, **Jogar** e, em baixo, o link **Modo livre**.
  - Avançado: o atraso fica numa secção `<details>` fechada.
  - **Modo livre** sai do jogo (`stopGame`).
- **Pausa:**
  - "Sair" passa a **"Menu do jogo"** (`game-menu`): acaba a ronda sem recorde, guarda o atraso aprendido e volta ao menu (fase `setup`).
  - Continuar e Recomeçar ficam como estão.
- **Resultado:** "Sair" passa a **"Menu do jogo"** (`game-menu`), e "Jogar outra vez" fica.
- **O ✕ da pista** passa a abrir o **menu do jogo**, como a pausa. O modo livre fica no link do menu e no interruptor **Livre** do cabeçalho.
- **Esc e clique fora:**
  - no menu, saem para o modo livre (como hoje no cartão de entrada);
  - no resultado, voltam ao menu;
  - na pausa, continuam (como hoje).

## 3. Seletor de dedos com as duas mãos

- No menu, as **duas mãos desenhadas** em CSS, como no palco: a esquerda à esquerda, com os mindinhos por fora.
  - Cada mão tem 4 dedos e um polegar, como pílulas verticais de alturas diferentes (o médio é o mais alto), sobre uma palma arredondada.
  - Cada dedo é um `<button>` com `aria-pressed`, `aria-label` com a mão e o dedo (`fingerName`), alvo ≥ 44 px e `data-testid="game-finger-<i>"`.
  - Ligado, acende com `FINGER_COLORS[i]`, a mesma cor da faixa na pista. Desligado, fica apagado.
  - Os polegares aparecem cinzentos, desativados, com o título "Os polegares não jogam".
- Com `MIN_GAME_FINGERS` dedos ligados, esses ficam desativados, com a dica "Pelo menos 2 dedos" (como hoje).
- **Atalhos:**
  - **Só esquerda** `[4, 3, 2, 1]`
  - **Só direita** `[6, 7, 8, 9]`
  - **Indicadores e médios** `[2, 1, 6, 7]`
  - O atalho ativo fica marcado.
- Por baixo, "N faixas · Teclado: …", como hoje.
- A 320 px, as duas mãos cabem lado a lado (o cartão já tem scroll).

## Arquitetura

- **`src/game/config.ts`:** `MIN_NOTE_GAP_S` (0,30) e `FINGER_PRESETS` (os três atalhos).
- **`src/game/generator.ts`:**
  - `generateChart({ …, lanes, split? })`, com `split` por defeito `Math.floor(lanes / 2)`;
  - `minGapSteps(bpm)`;
  - `enforceMinGap(onsets, steps)`;
  - `alternateHands(onsets, split, lanes)`, os dois exportados para testes.
- **`src/game/score.ts`:** `lateTaps`; `result()` com `lateTaps`.
- **`src/game/types.ts`:** `GameResult.lateTaps`.
- **`src/game/run.ts`:** um "Tarde" da câmara conta `score.lateTaps`. Conta sempre, e não só no primeiro de cada nota, porque o que interessa são as dobras.
- **`src/app/session.ts`:**
  - `startGame` passa `split` = o número de dedos da esquerda em `gameFingers`;
  - `backToMenu()`: termina a ronda, guarda o atraso e põe a fase `setup` com o resultado a null;
  - o resultado passa a voltar ao menu com `openGame()`.
- **UI:**
  - `src/ui/game/FingerPicker.tsx` (+ `.module.css`), novo, com as mãos e os atalhos;
  - `GameDialog.tsx`: usa o `FingerPicker`, mostra Avançado, os botões do menu e "Dobras vistas tarde";
  - `GameTrack.tsx`: o ✕ abre o menu do jogo;
  - i18n pt/en: `menu`, `freeMode`, `advanced`, `lateTaps`, `presets`, `thumbsOff`.
- **Testes:**
  - unitários: `minGapSteps`, `enforceMinGap` (nunca abaixo do mínimo; mantém a final), `alternateHands` (gaps < 1 tempo em mãos diferentes; uma só mão não muda), os invariantes do gerador com `split`, `lateTaps`;
  - e2e: o seletor (ligar e desligar com as mãos, os atalhos, o mínimo de 2 dedos), "Menu do jogo" na pausa e no resultado, o ✕ a levar ao menu, o link Modo livre, e "Avançado" fechado por defeito.
- **Decisão 69 e CHANGELOG 3.3.0**, ainda não publicada.
