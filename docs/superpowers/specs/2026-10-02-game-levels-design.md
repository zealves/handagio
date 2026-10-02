# Modo de jogo: níveis com progresso e estilos de som

Continua as v1, v2 e v3 (decisões 67–69), no ramo `feat/game-mode`, antes de publicar.

O utilizador quer:
- níveis com progresso: agora 3, cada um com um estilo de som diferente;
- mais níveis no futuro;
- poder repetir e escolher os níveis anteriores.

Pediu também o seletor de instrumentos dentro do jogo, com a escolha partilhada com o modo livre.

**Decidido com o utilizador:**
1. **Cada nível é uma música fixa** (semente fixa) com estilo e dificuldade próprios. O modo de hoje passa a **Treino**: a dificuldade escolhida e uma música nova a cada ronda.
2. **Estrelas por precisão:** ★ 50%, ★★ 70%, ★★★ 90%. Uma estrela abre o nível seguinte. Fica guardado o melhor de cada nível (estrelas, pontos e precisão), neste dispositivo.
3. **Cada nível tem o seu instrumento**, que só vale enquanto o nível dura. O seletor de instrumentos do menu do jogo (no Treino) é o mesmo do modo livre: mudar num sítio muda nos dois. Um nível não mexe na escolha do jogador.
4. **Os três estilos:**

| Nível | id | Melodia | Kit | Baixo | Escala, tónica | BPM | Densidade | Bateria | Linha de baixo |
|---|---|---|---|---|---|---|---|---|---|
| 1 Pop | `pop` | `piano` | `drums` | `bass` | Maior, Dó | 90 | `easy` | direita (a de hoje) | colcheias nos tempos 1 e 3 (a de hoje) |
| 2 Lo-fi | `lofi` | `epiano` | `drums` (suave) | `contrabass` | Dórica, Ré | 96 | `medium` (mais lento que o Médio) | swing | caminhada em semínimas |
| 3 Eletrónico | `electro` | `synth` | `tr808` | `bass` (synth, se existir o patch; senão `bass`) | Menor, Lá | 118 | `hard` (mais lento que o Difícil) | 4 no chão | pulsar em contratempo |

**Fora (YAGNI):** músicas escritas à mão, login e sincronização, mais de 3 níveis, recordes por combinação de dedos.

## 1. Dados dos níveis

`src/game/levels.ts` (puro):

```ts
interface SoundStyle {
  melody: string;
  kit: string;
  bass: string;
  scale: ScaleName;
  root: number;   // 0 = Dó
  octave: number; // oitava base da melodia
  drums: 'straight' | 'swing' | 'four';
  bassLine: 'eighths' | 'walk' | 'pulse';
  /** Atraso das colcheias em contratempo, em passos (0 = direito). */
  swing: number;
}
interface Level {
  id: string;
  difficulty: Difficulty; // densidade e tempo de chegada
  bpm: number;
  bars: number;
  seed: number;
  style: SoundStyle;
}
export const LEVELS: readonly Level[];
```

- **Swing:** `swing` 0,6 passos no Lo-fi, ou seja, as colcheias em contratempo ficam perto da tercina; 0 nos outros.
- **Ordem:** a ordem de `LEVELS` é a ordem de desbloqueio. Para juntar um nível, acrescenta-se uma entrada (e o nome no i18n).
- **Funções puras:**
  - `starsFor(accuracy): 0 | 1 | 2 | 3`, com os limiares `STAR_THRESHOLDS` `[0.5, 0.7, 0.9]`;
  - `isUnlocked(index, progress)`: o nível 0 está sempre aberto; o nível `i` abre com `progress[LEVELS[i − 1].id].stars ≥ 1`.

## 2. Gerador e ronda

- **`generateChart`** recebe, opcionalmente:
  - `bpm`, que substitui o da dificuldade;
  - `drums` e `bassLine`, que escolhem o padrão do acompanhamento (por defeito `straight` e `eighths`, que são os de hoje);
  - `swing`, guardado na `Chart`.

  O intervalo mínimo e as mãos alternadas (decisão 69) usam o BPM real.
- **Padrões por compasso** (o último compasso continua a ter o bombo, o prato e o baixo na tónica):
  - `straight`: o de hoje.
  - `swing`: bombo em 0 e 10, tarola em 4 e 12, choques em colcheias a 0,35; o swing aplica-se ao tocar.
  - `four`: bombo em 0, 4, 8 e 12, tarola ou palmas em 4 e 12, prato aberto (slot 3) em 2, 6, 10 e 14.
  - Baixo `eighths`: o de hoje.
  - Baixo `walk`: semínimas com os graus `d`, `d + 2`, `d + 4` e `d + 2`, em que `d` é o grau do acorde, com a duração de 4 passos.
  - Baixo `pulse`: colcheias em contratempo (2, 6, 10 e 14), no grau do acorde, com a duração de 2 passos.
  - Os slots vêm dos kits reais (`src/audio/drums/*.ts`): confirmar que o `tr808` usa a mesma ordem (bombo, tarola, choques, prato aberto, palmas…) e ajustar se não usar.
- **`GameRun`:** o tempo de cada passo é `start + s × stepDur + (s % 4 === 2 ? swing × stepDur : 0)`. Vale para as notas, para o acompanhamento agendado (o `onStep` soma o atraso ao `when` dos eventos em contratempo), para a pausa e a retoma, e para a pista. O juiz recebe os tempos já com o swing.

## 3. Sessão e progresso

- **`GameUi`** ganha `levelId: string | null`; `null` é o Treino.
- **`session.startLevel(id)`:**
  - gera a `Chart` com os dados do nível, os dedos do jogador e o `split`;
  - toca a melodia com `style.melody` na afinação do nível (`root`, `scale`, `octave` + o registo das amostras, via `tuningOf`);
  - toca o baixo com `style.bass` uma oitava abaixo da melodia e o kit com `style.kit`;
  - não muda o `instrument`, o `root` nem o `scale` do store.
- **O Treino** (`startGame(difficulty)`) fica como hoje.
- **Preferências novas** (validadas no `sanitizePrefs`; "Repor as preferências" mantém-nas):
  - `levelProgress: Record<string, { stars: number; points: number; accuracy: number }>`;
  - `gameTab: 'levels' | 'practice'`, por defeito `levels`;
  - `gameLevel: string`, o último escolhido, por defeito o primeiro.
- **No fim de um nível:**
  - `stars = starsFor(accuracy)`;
  - guarda o máximo de cada campo;
  - o resultado ganha `stars`, `unlocked: string | null` (o id do nível que esta ronda abriu, se abriu algum) e `levelId`.

  O `gameBest` só conta no Treino.
- **Recomeçar e "Jogar outra vez"** repetem o mesmo nível (ou a mesma dificuldade no Treino). **Próximo nível** (`session.startLevel(next)`) só aparece se o seguinte existir e estiver aberto.
- **Diagnóstico:** `__vsc.session.gameBars` também encurta os níveis. Um getter `gameMelody` (o instrumento da melodia da ronda) serve os testes.

## 4. Interface

- **O menu do jogo** tem os separadores **Níveis | Treino** (`game-tab-levels`, `game-tab-practice`, com `aria-pressed`). A escolha fica em `gameTab`.
- **Níveis:**
  - uma lista de cartões (`game-level-card-<id>`):
    - o número, o nome (i18n por id) e o instrumento (o nome do i18n dos instrumentos);
    - as estrelas (★ cheias ou vazias, com `aria-label` "N de 3 estrelas") e o recorde;
    - num cartão bloqueado, um cadeado e "Faz ★ no nível anterior", e o cartão fica `disabled`;
  - tocar num cartão aberto escolhe-o (`aria-pressed`, `gameLevel`), e **Jogar** começa esse nível.
- **Treino:** a dificuldade de hoje (`game-level-easy|medium|hard`) e o **instrumento**: uma linha "Instrumento: Piano" (`game-instrument`) que abre e fecha o `InstrumentPicker` que já existe, por baixo, partilhado com o modo livre.
- **Comuns:** os dedos, o Avançado, Jogar e Modo livre, como hoje.
- **Resultado de um nível:**
  - as estrelas ganhas (`game-stars`), e "Nível N desbloqueado!" (`game-unlocked`) quando for o caso;
  - os botões **Menu do jogo**, **Repetir** (`game-again`) e **Próximo nível** (`game-next`), este quando estiver aberto.

  O resultado do Treino fica como hoje.
- **i18n pt/en:**
  - `game.tabs`, `game.levelNames` (pop, lofi, electro), `game.locked`, `game.unlockHint`;
  - `game.unlocked(n)`, `game.next`, `game.repeat`, `game.starsLabel(n)`;
  - `game.instrument(name)`, `game.levelLabel(n)`.

## Testes

- **Unitários:**
  - `starsFor` (com os limites) e `isUnlocked`;
  - `LEVELS`: ids únicos, instrumentos e kits que existem (`instrumentInfo`, `DRUMS`), escalas válidas;
  - o gerador com `bpm`, `drums` e `bassLine`: os padrões por compasso, o último compasso, os invariantes de hoje (gaps por mão, final na tónica);
  - `GameRun` com `swing`: os tempos das notas e do acompanhamento em contratempo, e a pausa e retoma com swing;
  - `sanitizePrefs` dos campos novos.
- **e2e:**
  - o separador Níveis aparece por defeito, com o nível 1 aberto e os níveis 2 e 3 fechados;
  - uma ronda curta do nível 1 com acertos dá estrelas, abre o nível 2 e mostra "desbloqueado"; Próximo nível começa o 2 com o `gameMelody` `epiano`;
  - o `instrument` do store não mudou;
  - no Treino, o seletor de instrumento muda o `instrument`, e o modo livre fica com ele;
  - o progresso sobrevive a um recarregamento.

## Decisão a registar

Decisão 70, e o CHANGELOG 3.3.0, ainda não publicada.
