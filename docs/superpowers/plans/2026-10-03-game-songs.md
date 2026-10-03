# Músicas dos níveis 2 e 3 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os níveis 2 ("Noite") e 3 ("Neon") passam a ter músicas escritas à mão, com melodia, tapete de acordes, baixo e bateria próprios. Instrumentos mais agradáveis e sem swing.

**Architecture:**
- **Formato:** um tipo `Song` puro e as duas músicas, em `src/game/songs.ts`.
- **Gerador:** com uma `Song`, mapeia os graus para as faixas e usa o baixo, a bateria e o tapete escritos.
- **Acompanhamento:** um evento de tapete (`pad`), que a sessão toca.
- **Níveis:** os níveis 2 e 3 apontam para as músicas, com os instrumentos novos.

**Tech Stack:** TypeScript estrito, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-03-game-songs-design.md`

## Global Constraints
- `src/game` sem React nem áudio. Textos em `pt.ts` e `en.ts`. Comentários e testes em pt-PT. Constantes com nome.
- Antes de cada commit: `npm run build && npm run lint && npm test`. Commits em inglês, sem atribuição. Ramo `feat/game-mode`.
- **Os ids `lofi` e `electro` não mudam.** Os nomes passam a pt "Noite"/"Neon" e en "Night"/"Neon".
- **Instrumentos:** nível 2 `vibes` + `pad` + `contrabass` + kit `drums`, Ré dórico, 90 BPM; nível 3 `pluck` + `pad` + `bass` + kit `tr808`, Lá menor, 112 BPM. Swing 0.
- **Músicas:** 16 compassos, tocados duas vezes. Graus 0..7. Forma A A' B A'. No máximo 2 colcheias seguidas. Com 8 faixas, nenhuma nota é removida nem mudada pelas regras (0,30 s por mão, mãos alternadas, 1 tempo na mesma faixa).

## Review Focus
1. **As músicas soam a música:** frases, resolução na tónica, um ritmo que acompanha a bateria. Quem revê lê as notas como partitura e confirma que os acordes de `chords` encaixam nas notas fortes da melodia.
2. **O mapeamento para menos faixas** mantém o desenho e não parte os invariantes.
3. **O nível 1 (Pop) não muda nada:** a mesma `Chart` para a mesma semente.

---

### Task 1: Formato `Song`, as duas músicas e o gerador

**Files:**
- Create: `src/game/songs.ts` (+ test)
- Modify: `src/game/generator.ts` (+ test), `src/game/types.ts`, `src/game/levels.ts` (+ test)

- [ ] **Tipos em `songs.ts`:**
  - `SongNote { step; degree; dur }` (o `step` conta-se dentro da música, 16 por compasso);
  - `DrumHit { step; slot; vel }` (o `step` conta-se dentro do compasso);
  - `Song { bars; melody: SongNote[]; chords: number[]; bass: SongNote[]; drums: { verse: DrumHit[]; chorus: DrumHit[]; chorusBars: number[] } }`.
- [ ] **Escrever `NIGHT` (nível 2) e `NEON` (nível 3).** São músicas de 16 compassos, com a forma A A' B A', em frases de 4 compassos:
  - **`NIGHT`**, para vibrafone em Ré dórico a 90 BPM, calmo e jazzy:
    - a melodia é sobretudo de semínimas e mínimas, com algumas colcheias em pares, e respira no fim das frases;
    - progressão com sabor dórico, por exemplo i–IV–i–v (graus 0, 3, 0, 4) com variações no B;
    - baixo a andar em semínimas pelas notas do acorde;
    - bateria suave: bombo em 1 e no "e" do 3, tarola em 2 e 4 a 0,5, choques em colcheias a 0,3.
  - **`NEON`**, para pluck em Lá menor a 112 BPM, dançável:
    - frases curtas e repetitivas (um gancho de 2 compassos repetido com variação), colcheias em pares com pausas;
    - progressão i–VI–III–VII (graus 0, 5, 2, 6);
    - baixo em colcheias nos contratempos ou em oitavas;
    - bateria 808: bombo nos 4 tempos, palmas em 2 e 4, prato aberto nos contratempos; o refrão tem choques em semicolcheias suaves no `tr808`.
  - **Regras para as duas:**
    - graus 0..7 e no máximo 2 colcheias seguidas;
    - na mesma faixa, pelo menos 1 tempo entre notas;
    - notas a menos de 1 tempo da anterior ficam noutra mão (com 8 faixas e `split` 4, faixas 0–3 e 4–7);
    - o último compasso acaba na tónica (grau 0 ou 7).

    Comenta cada frase (A, A', B).
- [ ] **Testes de `songs.test.ts`**, para cada música:
  - os graus estão em 0..7, os passos em `[0, bars × 16)` e `chords.length === bars`;
  - mapeada para 8 faixas com `split` 4, as regras do gerador (`alternateHands`, `enforceMinGap` com o BPM e o swing 0, `spaceLanes`) não removem nem mudam nenhuma nota;
  - a nota final é a tónica;
  - a nota mais forte de cada compasso (a primeira ou a mais longa) pertence à tríade do acorde desse compasso em pelo menos 75% dos compassos.
- [ ] **Gerador:**
  - `GenerateOptions` ganha `song?: Song` (os instrumentos ficam no nível; o gerador só produz eventos). `BackingEvent` ganha `{ kind: 'pad'; step: number; degrees: number[]; dur: number; vel: number }`.
  - Com uma `song`, `generateChart`:
    - percorre a música duas vezes (`bars = song.bars × 2`, salvo `o.bars` mais curto, para os testes e o `gameBars`);
    - mapeia o grau `d` para a faixa `Math.round((d × (lanes − 1)) / 7)`;
    - aplica `alternateHands`, depois o intervalo por mão e depois `spaceLanes`, como hoje, e garante a final na tónica;
    - gera o acompanhamento a partir da `song`: a bateria por compasso (`verse` ou `chorus`), o baixo escrito e um evento `pad` por compasso com os graus da tríade `[c, c + 2, c + 4]`, com volume ~0,25;
    - mantém a entrada (os choques) e o último compasso (bombo, prato com `crashSlotFor(kit)` e a tónica).
  - Sem `song`, fica como hoje: o nível 1 tem de dar exatamente a mesma `Chart` para a mesma semente. Há um teste que compara com um instantâneo (snapshot) ou com uma assinatura das notas, guardada antes da mudança.
- [ ] **`levels.ts`:**
  - **`lofi`:** `song: NIGHT`, `bpm` 90, `style` com `melody: 'vibes'`, `pad: 'pad'`, `bass: 'contrabass'`, `kit: 'drums'`, Dórica, Ré, `swing: 0`.
  - **`electro`:** `song: NEON`, `bpm` 112, `melody: 'pluck'`, `pad: 'pad'`, `bass: 'bass'`, `kit: 'tr808'`, Menor, Lá, `swing: 0`.
  - **`Level`** ganha `song?: Song`, e `SoundStyle` ganha `pad?: string`.
  - **O teste de `src/audio/gameLevels.test.ts`** confirma que `vibes`, `pluck`, `pad` e `contrabass` existem e que `pad` é melódico.
- [ ] **Testes do gerador com uma `Song`:**
  - com 8 faixas, as notas da `Chart` são exatamente as da música (as duas passagens) mapeadas, com a final na tónica;
  - com 4 e 6 faixas, os invariantes de sempre;
  - existem eventos `pad`, um por compasso, exceto no último.
- [ ] Fazer commit: `feat: add hand-written songs for levels 2 and 3`.

### Task 2: Sessão, nomes e e2e
- [ ] **Sessão:**
  - `RoundSpec` e `startLevel` passam a `song` ao `generateChart`;
  - `playBacking` trata o `pad`: para cada grau, `audio.noteOn` com uma chave única no instrumento `style.pad` (ou `pad` por defeito), na afinação da ronda, na oitava da melodia, e `noteOff` ao fim de `dur × stepDur`;
  - carrega também as amostras do tapete;
  - em pausa, o `releaseAll` corta o tapete, como os outros.
- [ ] **i18n:** os nomes dos níveis passam a pt "Noite"/"Neon" e en "Night"/"Neon". Os ids não mudam.
- [ ] **e2e:**
  - com o progresso posto, `startLevel('lofi')` dá `gameMelody === 'vibes'` e `startLevel('electro')` dá `'pluck'`;
  - o teste que esperava `epiano` passa a esperar `vibes`;
  - uma ronda curta do nível 2 corre até ao resultado.
- [ ] **Decisão 72:**
  - porque se escreveu à mão;
  - o formato `Song`;
  - o mapeamento para as faixas;
  - os instrumentos e a saída do swing;
  - os nomes novos com os ids de sempre.

  **CHANGELOG 3.3.0:** os níveis 2 e 3 com músicas novas.
- [ ] Verificar com `npm run build && npm run lint && npm test` e o e2e do jogo. Fazer commit: `feat: play the written songs with a chord pad and rename levels 2 and 3`.
