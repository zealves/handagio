# Modo de jogo v5: só níveis, silêncio fora da música, erros na pontuação e cores claras

Continua as decisões 67–70, no ramo `feat/game-mode`, antes de publicar. Responde ao feedback do utilizador:
- "As cores das notas devem corresponder ao dedo da mão."
- "Aumentar a área de toque; o círculo com a forma da nota e maior."
- "Só os dedos que tocam com o círculo; os outros menos destacados."
- "Remover o Treino; já existe o modo livre."
- "Antes e depois da música não pode ser possível tocar som."
- "A pontuação deve ser afetada por notas falhadas ou mal tocadas: se tocar sempre todas, acerto sempre."

Também fecha os três pontos que ficaram da revisão final dos níveis.

## 1. Correções da revisão anterior
- **A dica de desbloqueio no resultado** ("★ com 50% de precisão abre o nível seguinte") só aparece se existir um nível seguinte e ele ainda estiver fechado. No último nível nunca aparece.
- **No resultado de um nível**, um recorde de 0 pontos mostra "Sem recorde" (`noBest`).
- **A dica do resultado** fica alinhada à esquerda, como as outras linhas do cartão. A da lista dos níveis continua centrada.

## 2. Cores iguais em todo o lado
- A nota, o alvo e o dedo no desenho das mãos usam a mesma cor, `FINGER_COLORS[dedo]`.
- "Cedo!" e "Tarde!" passam de amarelo (`#ffd166`, que é a cor do polegar esquerdo) a branco. Os falhados continuam vermelhos.
- Não há nenhuma outra cor de nota no jogo.

## 3. Alvo com a forma da nota
- O alvo de cada faixa na linha de impacto passa a ser uma pílula arredondada com a forma das notas:
  - **Largura:** 1,2× a largura da nota a essa profundidade, sem passar a faixa.
  - **Altura:** 1,4× a altura da nota.
  - **Cor:** contorno da cor do dedo, clarão a encher quando acerta, e um brilho suave.
- A janela de tempo não muda.

## 4. Só os dedos que jogam em destaque
Com o jogo a decorrer ou em pausa, o desenho das mãos sobre o palco (`drawOverlay`) muda assim:
- **Dedos com faixa:** em vez do anel redondo, uma pílula (a forma da nota) da cor do dedo, maior (~1,3× o anel de hoje), que enche com a dobra.
- **Outros dedos:** anel pequeno, cinzento (`#8a93a6`), com opacidade de ~0,25 e sem brilho.
- **Esqueleto:** desenhado com ~40% da opacidade de hoje.

Os dedos que jogam vêm de `getState().game.fingers`.

## 5. Sem Treino
- O menu do jogo fica só com a lista dos níveis, mais os dedos, o Avançado, Jogar e Modo livre.
- Saem:
  - os separadores;
  - a escolha da dificuldade;
  - o seletor de instrumentos no jogo;
  - o recorde do Treino;
  - o caminho `startGame(difficulty)` do Treino.
- Saem também as preferências `gameBest`, `gameDifficulty` e `gameTab`: as chaves antigas guardadas deixam de ser lidas e desaparecem na próxima gravação.
- Os níveis continuam a usar `difficulty` para a densidade.
- `restartGame` e "Jogar outra vez" repetem o nível.
- O modo livre continua com o instrumento e tudo o resto.

## 6. Silêncio fora da música
- Com o jogo aberto (`getState().game !== null`), uma dobra ou tecla de dedo só soa e só é julgada **durante a música**: entre `countTo` (o fim da contagem, inicial ou depois de uma pausa) e a última nota mais `NEAR_S`.
- Antes disso, depois disso, no menu, no resultado e na pausa, não toca nada:
  - nem a nota livre;
  - nem o modo contínuo (teremim);
  - nem o modo teclado.
- O efeito da boca continua.
- Função pura `GameRun.isMusicTime(now)`.

## 7. Erros na pontuação
- **Toque errado:**
  - **o que é:** um toque, durante a música, num dedo com faixa, sem nenhuma nota por julgar dessa faixa até `NEAR_S` (nem acerto nem Cedo/Tarde);
  - **efeito:** parte o combo, conta `wrongTaps` e entra na precisão;
  - **som:** a nota da faixa continua a soar (decisão 68).
- **Tolerância:** não conta como errado um toque até `NEIGHBOUR_GRACE_S` (0,15 s) depois de um acerto noutra faixa **vizinha da mesma mão** (o índice da faixa ± 1, do mesmo lado do `split`). Para isso a `Chart` passa a guardar o `split`.
- **"Cedo!/Tarde!"** parte o combo, mas não conta como errado.
- **Falhar uma nota:** fica como hoje.
- **Precisão:** `(perfeitos + 0,5 × bons) / (notas + 0,5 × errados)`, limitada a [0, 1]. As estrelas usam esta precisão.
- **Resultado:** "Toques errados: N" quando N > 0.

## Testes
- **Unitários:**
  - a precisão com toques errados;
  - o combo partido por um errado e por Cedo/Tarde;
  - a tolerância do vizinho (mesma mão e índice ± 1, até 0,15 s; não vale entre mãos nem com 2 de distância);
  - `isMusicTime` antes, durante e depois da música, e depois de uma pausa;
  - a `Chart` com o `split`.
- **e2e:**
  - o menu sem separadores nem Treino;
  - premir as teclas antes da contagem acabar não deixa vozes;
  - premir todas as teclas sem parar dá toques errados, menos estrelas e "Toques errados" no resultado;
  - no último nível com 0 estrelas, não aparece a dica de desbloqueio;
  - o desenho das mãos durante o jogo: há um `live`/debug com os dedos destacados, ou confirma-se só por unitários na parte pura.

## Decisão a registar
Decisão 71, e o CHANGELOG 3.3.0: tira o Treino e junta o resto.
