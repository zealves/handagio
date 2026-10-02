# Níveis do jogo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3 níveis com música fixa e estilo de som próprio (Pop, Lo-fi, Eletrónico), estrelas por precisão, desbloqueio em sequência e progresso guardado. O modo de hoje passa a "Treino", com o seletor de instrumentos partilhado com o modo livre.

**Architecture:**
- **Lógica pura** (`src/game/`):
  - os dados dos níveis (`levels.ts`), as estrelas e o desbloqueio;
  - no gerador, os padrões de acompanhamento por estilo e o BPM opcional;
  - no `GameRun`, o swing nos tempos.
- **Sessão:** `startLevel(id)` usa o som do nível sem mexer nas preferências do modo livre, e guarda o progresso no fim.
- **UI:**
  - os separadores Níveis | Treino, os cartões dos níveis e o seletor de instrumentos;
  - o resultado com estrelas e "Próximo nível".

**Tech Stack:** TypeScript estrito, React 18, Zustand, Web Audio, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-game-levels-design.md`

## Global Constraints

- `src/game` não importa React nem o áudio. Valores a 60 fps nunca vão para o estado React.
- Textos só em `pt.ts` (fonte de verdade) e `en.ts`. Os nomes dos níveis traduzem-se pelo id, e os ids guardados não mudam. Corre o `check-bundle-texts`.
- `<dialog>`, sem alert/confirm. Alvos ≥ 44 px (a exceção dos dedos a 320 px da decisão 69 mantém-se). Comentários e nomes de testes em pt-PT. Constantes com nome e comentário.
- Antes de cada commit: `npm run build && npm run lint && npm test`. Commits em inglês, Conventional Commits, sem atribuição. Ramo `feat/game-mode`.
- **Valores:**
  - `STAR_THRESHOLDS` `[0.5, 0.7, 0.9]`
  - os níveis da tabela da spec:
    - **pop:** `piano`, `drums`, `bass`, Maior, Dó, 90 BPM, `easy`, `straight`/`eighths`, swing 0
    - **lofi:** `epiano`, `drums`, `contrabass`, Dórica, Ré, 96 BPM, `medium`, `swing`/`walk`, swing 0,6
    - **electro:** `synth`, `tr808`, `bass`, Menor, Lá, 118 BPM, `hard`, `four`/`pulse`, swing 0
  - `bars` 32 nos três
  - as sementes escolhem-se na Task 1 (ver lá)

## Review Focus

1. **Um nível não pode mudar as preferências do modo livre** (`instrument`, `root`, `scale`, `octave`). Há um e2e na Task 4.
2. **O swing tem de ser coerente:** as notas, o acompanhamento em contratempo, o juiz, a pista e a pausa e retoma usam todos o mesmo `timeOf(step)`. Há testes unitários na Task 1.
3. **O desbloqueio e o progresso guardam só o máximo e sobrevivem a um recarregamento.** "Repor as preferências" mantém-nos. Há testes unitários e e2e.
4. **Os ids dos níveis são dados guardados:** não mudam. Os textos traduzem-se pelo id.

---

### Task 1: Lógica — níveis, estrelas, estilos do acompanhamento e swing

**Files:**
- Create: `src/game/levels.ts`, `src/game/levels.test.ts`
- Modify: `src/game/generator.ts` (+ test), `src/game/run.ts` (+ test), `src/game/types.ts`

**Produces:**
- `SoundStyle`, `Level`, `LEVELS`, `STAR_THRESHOLDS`
- `starsFor(acc): 0 | 1 | 2 | 3`
- `isUnlocked(index, progress)`
- `levelIndex(id)`
- `type LevelProgress = Record<string, { stars: number; points: number; accuracy: number }>`
- `GenerateOptions` ganha `bpm?`, `drums?`, `bassLine?` e `swing?`; `Chart.swing: number` (0 por defeito)
- `GameRun.timeOf(step)` (público), usado em todo o lado

- [ ] **Step 1: `levels.ts` e testes**

```ts
// Níveis do modo de jogo: cada um é uma música fixa (semente) com um estilo de som. A ordem é a
// de desbloqueio; para juntar um nível acrescenta-se uma entrada (e o nome em i18n pelo id).
import type { ScaleName } from '../audio/theory'; // só o tipo: `src/game` continua sem áudio
import type { Difficulty } from './types';

export type DrumStyle = 'straight' | 'swing' | 'four';
export type BassLine = 'eighths' | 'walk' | 'pulse';
export interface SoundStyle {
  melody: string;
  kit: string;
  bass: string;
  scale: ScaleName;
  root: number;
  octave: number;
  drums: DrumStyle;
  bassLine: BassLine;
  /** Atraso das colcheias em contratempo (passos; 0 = direito). */
  swing: number;
}
export interface Level {
  id: string;
  difficulty: Difficulty;
  bpm: number;
  bars: number;
  seed: number;
  style: SoundStyle;
}
export type LevelProgress = Record<string, { stars: number; points: number; accuracy: number }>;

/** Precisão mínima para 1, 2 e 3 estrelas. */
export const STAR_THRESHOLDS = [0.5, 0.7, 0.9] as const;

export const LEVELS: readonly Level[] = [
  { id: 'pop', difficulty: 'easy', bpm: 90, bars: 32, seed: SEED_POP,
    style: { melody: 'piano', kit: 'drums', bass: 'bass', scale: 'Maior', root: 0, octave: 4,
             drums: 'straight', bassLine: 'eighths', swing: 0 } },
  { id: 'lofi', difficulty: 'medium', bpm: 96, bars: 32, seed: SEED_LOFI,
    style: { melody: 'epiano', kit: 'drums', bass: 'contrabass', scale: 'Dórica', root: 2, octave: 4,
             drums: 'swing', bassLine: 'walk', swing: 0.6 } },
  { id: 'electro', difficulty: 'hard', bpm: 118, bars: 32, seed: SEED_ELECTRO,
    style: { melody: 'synth', kit: 'tr808', bass: 'bass', scale: 'Menor', root: 9, octave: 4,
             drums: 'four', bassLine: 'pulse', swing: 0 } },
];

export const starsFor = (acc: number): 0 | 1 | 2 | 3 =>
  (STAR_THRESHOLDS.filter((t) => acc >= t).length as 0 | 1 | 2 | 3);
export const levelIndex = (id: string): number => LEVELS.findIndex((l) => l.id === id);
/** O primeiro está sempre aberto; os outros abrem com ★ no anterior. */
export function isUnlocked(index: number, progress: LevelProgress): boolean {
  if (index <= 0) return index === 0;
  const prev = LEVELS[index - 1];
  return !!prev && (progress[prev.id]?.stars ?? 0) >= 1;
}
```

`SEED_*` são constantes com nome. Escolhe sementes que dão uma música agradável: gera 20 candidatas por nível com o gerador da Step 2 e escolhe uma que tenha uma subida de densidade clara, sem a mesma faixa repetida mais de 3 vezes seguidas e a final na tónica. Documenta no comentário o critério e os valores.

Testes (`levels.test.ts`):
- `starsFor`: 0,49 → 0, 0,5 → 1, 0,7 → 2, 0,9 → 3, 1 → 3;
- `isUnlocked` com o progresso vazio: [true, false, false]; com `{ pop: { stars: 1 } }`: [true, true, false]; com `{ pop: { stars: 0 } }`: o 2 continua fechado;
- ids únicos; `levelIndex('lofi')` → 1;
- num teste do lado do áudio (`src/audio/instruments.test.ts` ou um ficheiro novo em `src/audio`), que cada `style.melody` e `style.bass` seja um instrumento melódico conhecido (`instrumentInfo(id).id === id`), que cada `style.kit` exista em `DRUMS` e que cada `style.scale` esteja em `SCALES`. Fica fora de `src/game` para manter a regra.

- [ ] **Step 2: Gerador**

`GenerateOptions` ganha `bpm?: number`, `drums?: DrumStyle`, `bassLine?: BassLine` e `swing?: number`. Em `generateChart`:
- `const bpm = o.bpm ?? cfg.bpm;`, usado no `minGapSteps(bpm)` e no `Chart.bpm`;
- `backing(bars, o.difficulty, prog, o.drums ?? 'straight', o.bassLine ?? 'eighths')`;
- `swing: o.swing ?? 0` na `Chart` (o tipo `Chart` ganha `swing: number`).

Em `backing`, dentro do ciclo dos compassos (o último compasso e a entrada ficam como estão):

```ts
    if (drums === 'straight') { /* o de hoje: choques a hatEvery, bombo 0/8, tarola 4/12 */ }
    else if (drums === 'swing') {
      for (let s = 0; s < BAR; s += 2) drum(base + s, DRUM_SLOT.hat, 0.35);
      drum(base, DRUM_SLOT.kick, 0.85);
      drum(base + 10, DRUM_SLOT.kick, 0.7);
      drum(base + 4, DRUM_SLOT.snare, 0.6);
      drum(base + 12, DRUM_SLOT.snare, 0.6);
    } else {
      for (const s of [0, 4, 8, 12]) drum(base + s, DRUM_SLOT.kick, 0.95);
      drum(base + 4, DRUM_SLOT.clap, 0.7);
      drum(base + 12, DRUM_SLOT.clap, 0.7);
      for (const s of [2, 6, 10, 14]) drum(base + s, DRUM_SLOT.openHat, 0.4);
    }
    if (bassLine === 'eighths') /* o de hoje: [0, 2, 8, 10], dur 2 */;
    else if (bassLine === 'walk')
      [0, 2, 4, 2].forEach((add, k) =>
        ev.push({ step: base + k * 4, kind: 'bass', degree: degree + add, dur: 4, vel: 0.65 }));
    else for (const s of [2, 6, 10, 14]) ev.push({ step: base + s, kind: 'bass', degree, dur: 2, vel: 0.7 });
```

- `DRUM_SLOT` ganha `openHat: 3` e `clap: 4`. Confirma em `src/audio/drums/tr808.ts` (e `latin.ts`) a ordem dos slots, compara com `acoustic.ts` (bombo, tarola, choques, prato aberto, palmas… e o prato em 9), e ajusta os números se for diferente, com um comentário.
- Os graus do baixo `walk` podem passar o tamanho da escala. Isso é aceitável, porque `degreeToMidi` sobe a oitava.

Testes (`generator.test.ts`), com o compasso 0 e `bars: 4`:
- `swing`: o bombo em [0, 10] e os choques a cada 2;
- `four`: o bombo em [0, 4, 8, 12], as palmas em [4, 12] e o prato aberto em [2, 6, 10, 14];
- baixo `walk`: os passos [0, 4, 8, 12] e os graus `[d, d + 2, d + 4, d + 2]`;
- baixo `pulse`: [2, 6, 10, 14];
- o último compasso igual ao de hoje em todos os estilos;
- `bpm` substitui o da dificuldade (`c.bpm`), e os gaps por mão seguem `minGapSteps(bpm)`;
- `swing` passa para a `Chart`;
- os invariantes de hoje com estes parâmetros, em 20 sementes por nível (com os parâmetros de `LEVELS`).

- [ ] **Step 3: Swing no `GameRun`**

- Acrescenta `/** Tempo de áudio do passo `s` da partitura (com o swing nas colcheias em contratempo). */ timeOf(s: number): number { return this.start + s * this.timing.stepDur + (((s % 4) + 4) % 4 === 2 ? this.chart.swing * this.timing.stepDur : 0); }`.
- `this.times = chart.notes.map((n) => this.timeOf(n.step))`.
- No `onStep`, os eventos de acompanhamento num passo `rel` com `((rel % 4) + 4) % 4 === 2` tocam em `time + chart.swing * stepDur`. A contagem da retoma não leva swing.
- Na pausa e retoma, o `pRel` e o deslocamento continuam em passos inteiros, e os `times` deslocam-se como hoje. Confirma que `start` muda e que `timeOf` continua certo depois da retoma.

Testes (`run.test.ts`), com uma `Chart` com `swing: 0.6` e notas nos passos 0 e 2:
- os `times` são `[start, start + (2 + 0.6) × stepDur]`;
- um evento de acompanhamento no passo 2 toca em `time + 0,6 × stepDur`;
- a pausa e a retoma mantêm o swing (`times[1] − times[0]` igual antes e depois).

- [ ] **Step 4: Verificar e fazer commit**

`npx vitest run src/game src/audio`, depois `npm run build && npm run lint && npm test`.

```bash
git commit -am "feat: add game levels with sound styles, stars and swing"   # e git add dos ficheiros novos
```

---

### Task 2: Preferências e sessão

**Files:** `src/state/store.ts`, `src/state/types.ts`, `src/ui/shell/logic.ts` (+ test), `src/ui/panels/SettingsDialog.tsx`, `src/app/session.ts`, `src/game/types.ts`

- [ ] **Store:**
  - prefs `levelProgress: LevelProgress` (por defeito `{}`), `gameTab: 'levels' | 'practice'` (por defeito `'levels'`) e `gameLevel: string` (por defeito `LEVELS[0].id`);
  - `sanitizePrefs`:
    - `levelProgress`: só os ids de `LEVELS`, com `stars` inteiro 0–3, `points` inteiro ≥ 0 e `accuracy` em 0–1; o resto cai fora;
    - `gameTab` inválido → `'levels'`;
    - `gameLevel` desconhecido → o primeiro;
    - testes em `logic.test.ts`;
  - "Repor as preferências" mantém `levelProgress`.
- [ ] **`GameUi`** ganha `levelId: string | null`. **`GameResult`** ganha `stars: number | null`, `unlocked: string | null` e `levelId: string | null`.
- [ ] **Sessão:**
  - **Uma função interna `startRound(spec)`**, que serve o Treino (`startGame(difficulty)`) e os níveis (`startLevel(id)`), para não duplicar código:
    - o `spec` dá a dificuldade, o BPM, os compassos (`gameBars ?? level.bars`), a semente (do nível, ou aleatória no Treino), os estilos e o swing;
    - dá também o som: `melody`, `kit` e `bass`, e a afinação `{ root, scale, octave }` (a do nível, ou a do store no Treino).
  - **`this.game` guarda o som e a afinação da ronda.** `gamePress` e `playBacking` passam a ler daí, em vez do store:
    - a melodia em `tuningOf({ ...tuning, instrument: melody })`;
    - o baixo uma oitava abaixo da melodia, no instrumento `bass`;
    - o kit `kit` no `audio.drum`.
  - Carrega as amostras dos três instrumentos ao começar.
  - **`startLevel(id)`:** só se `isUnlocked(levelIndex(id), getState().levelProgress)`. Guarda `gameLevel: id` e põe `game.levelId`.
  - **`finishGame`:**
    - se for um nível: `stars = starsFor(result.accuracy)`, guarda o máximo de cada campo em `levelProgress[id]` e põe `unlocked` = o id do nível seguinte se estava fechado e ficou aberto. Não mexe no `gameBest`.
    - se for o Treino: como hoje.
  - **`restartGame()` e "Jogar outra vez"** repetem o nível ou a dificuldade da ronda (`ui.levelId ? startLevel : startGame`).
  - **`nextLevel()`** começa o nível a seguir ao da ronda, se estiver aberto.
  - **Diagnóstico:** `get gameMelody(): string | null` (o `melody` da ronda).
- [ ] Verificar (`npm run build && npm run lint && npm test`) e fazer commit: `feat: start game levels with their own sound and save the progress`.

---

### Task 3: Interface

**Files:** `src/ui/game/GameDialog.tsx` (+ css), um `LevelList.tsx` novo (+ css), `src/i18n/locales/pt.ts`, `src/i18n/locales/en.ts`

- [ ] **i18n (pt e en):**
  - **Separadores:** `game.tabs: { levels: 'Níveis', practice: 'Treino' }`.
  - **Níveis:** `game.levelNames: { pop: 'Pop', lofi: 'Lo-fi', electro: 'Eletrónico' }` (en: Pop, Lo-fi, Electronic), `game.levelLabel: (n) => \`Nível ${n}\``, `game.locked: 'Bloqueado'`, `game.unlockHint: 'Faz ★ no nível anterior'`, `game.starsLabel: (n) => \`${n} de 3 estrelas\``.
  - **Resultado:** `game.unlocked: (name) => \`${name} desbloqueado!\``, `game.next: 'Próximo nível'`, `game.repeat: 'Repetir'`.
  - **Instrumento:** `game.instrument: (name) => \`Instrumento: ${name}\``.
  - O nome do instrumento vem de `instrumentText(id)` (`src/i18n/data.ts`).
- [ ] **Separadores no menu:** dois botões (`game-tab-levels`, `game-tab-practice`, com `aria-pressed`, alvo ≥ 44 px) por baixo do título, que guardam `gameTab`.
- [ ] **`LevelList`:** um cartão por nível (`game-level-card-<id>`), um botão com:
  - "Nível N", o nome, o instrumento da melodia, as estrelas (3 ★ cheias ou vazias, com `aria-label` `starsLabel`) e o recorde (pontos);
  - quando está bloqueado: `disabled`, um cadeado, a dica `unlockHint` e opacidade baixa;
  - quando está escolhido: `aria-pressed` e o contorno `--cyan`.

  Clicar num cartão aberto faz `set({ gameLevel: id })`.
- [ ] **Treino:**
  - a dificuldade de hoje;
  - uma linha `game-instrument` ("Instrumento: Piano", com ▸ / ▾) que abre e fecha o `<InstrumentPicker />` por baixo (o componente que já existe, partilhado);
  - o cartão tem scroll, que já existe.
- [ ] **Jogar:** no separador Níveis chama `session.startLevel(gameLevel)`; no Treino, `session.startGame(gameDifficulty)`. Os dedos, o Avançado e o Modo livre ficam em comum.
- [ ] **Resultado de um nível** (`r.levelId`):
  - o nome do nível;
  - as estrelas grandes (`game-stars`, com o `aria-label`);
  - `game-unlocked` quando `r.unlocked`;
  - os botões Menu do jogo, Repetir (`game-again`) e Próximo nível (`game-next`), este se houver um nível seguinte aberto.

  O resultado do Treino fica como hoje.
- [ ] **A pista** mostra o nome do nível ou "Treino" num canto pequeno. É opcional; faz-se só se couber sem tapar a pontuação.
- [ ] Verificar (`npm run build && npm run lint && npm test`), tirar capturas do menu a 320×568 e a 1280×800 nos dois separadores e do resultado de um nível (com um script de Playwright descartável e o `vite preview`), e olhar para elas. Fazer commit: `feat: add the levels list, practice tab with instrument picker and level results`.

---

### Task 4: e2e

**Files:** `e2e/game.spec.ts`

- [ ] **Atualizar** os testes que começam rondas: o Treino passa a precisar de `game-tab-practice` antes de escolher a dificuldade, ou usam-se os níveis.
- [ ] **Testes novos:**
  - o menu abre no separador Níveis; o nível 1 está aberto e os níveis 2 e 3 estão `disabled`;
  - **o nível 1 completo:**
    - com `gameBars = 2`, joga-se o nível 1 com o `hitNotes` em todas as notas;
    - aparecem `game-stars` e `game-unlocked`;
    - `levelProgress.pop.stars ≥ 1`;
    - `game-next` começa o nível 2 (`gameMelody === 'epiano'`, `game.levelId === 'lofi'`);
    - o `instrument` do store não mudou;
  - **o progresso sobrevive a um recarregamento:** depois do teste anterior, `page.reload()`, o menu tem o nível 2 aberto e o 1 com estrelas;
  - **o Treino:** `game-tab-practice`, depois `game-instrument`, escolhe outro instrumento no picker (por exemplo o primeiro que não seja o atual), o `instrument` do store muda, e depois `mode-free` deixa as pills a mostrar o instrumento novo;
  - **"Repetir" num nível** repete o mesmo `levelId`.
- [ ] `npx playwright test e2e/game.spec.ts --repeat-each=3` e `npm run test:e2e`. Se o áudio da máquina estiver preso, usa uma config temporária com `--disable-audio-output` e diz isso no relatório. Fazer commit: `test: cover game levels, stars, unlocking and the practice instrument`.

---

### Task 5: Documentação

- [ ] **Decisão 70:**
  - os níveis como dados, os três estilos (a tabela), o swing e os padrões;
  - as estrelas e o desbloqueio, o progresso local e o Treino;
  - o instrumento do nível só durante o nível, e o seletor partilhado no Treino;
  - os ids guardados que não mudam;
  - como juntar um nível.
- [ ] **CHANGELOG 3.3.0:** os níveis, as estrelas, o Treino e o instrumento no jogo.
- [ ] **CLAUDE.md:** uma frase sobre `src/game/levels.ts`.
- [ ] Fazer commit: `docs: record game levels in decision 70`.
