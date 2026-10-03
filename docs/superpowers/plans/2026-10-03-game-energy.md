# Energia e uma só mão — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma energia como o Star Power, que se enche com acertos e se ativa abrindo a boca, dá ×2 durante 8 s. No jogo, a boca deixa de aplicar o efeito de som. Ao jogar com uma só mão, a outra mão fica escondida.

**Spec:** `docs/superpowers/specs/2026-10-03-game-energy-design.md`

## Global Constraints
- `src/game` sem React nem áudio. Textos em `pt.ts` e `en.ts`. Comentários e testes em pt-PT. Constantes com nome.
- **Valores:**
  - `ENERGY_PERFECT` 0,05, `ENERGY_GOOD` 0,025
  - `POWER_S` 8, `POWER_MULTIPLIER` 2
  - `MOUTH_ACTIVATE` 0,6, `POWER_REVERB_BOOST` 0,3
  - dourado `#ffd166`
- Antes de cada commit: `npm run build && npm run lint && npm test`. Commits em inglês, sem atribuição. Ramo `feat/game-mode`.

## Review Focus
1. **A energia na pausa e na retoma**, e no fim da ronda.
2. **O reverb** volta sempre ao valor do jogador: no fim, na pausa, ao sair e no menu.
3. **A boca no jogo** nunca aplica o efeito de som. A deteção da cara corre no jogo mesmo com o efeito "Nenhum", e volta ao normal fora do jogo.
4. **Esconder a mão** não esconde a mão errada (o lado do ecrã contra a lateralidade).

### Task 1: Lógica da energia
**Files:** `src/game/config.ts`, `run.ts`, `score.ts`, `types.ts` (+ testes)
- [ ] **Constantes** em `config.ts`, com comentários.
- [ ] **`GameRun`:**
  - `energy = 0`, `powerUntil = -Infinity`, `powerUses = 0`;
  - nos acertos, se a energia não estiver ativa, `energy = min(1, energy + (perfect ? ENERGY_PERFECT : ENERGY_GOOD))`;
  - `powerActive(now) { return now < this.powerUntil && this.state !== 'over'; }` (em pausa, `now` é a vista congelada: a sessão usa `viewNow`);
  - `canActivate(now) { return this.energy >= 1 && !this.powerActive(now) && this.isMusicTime(now); }`;
  - `activatePower(now) { if (!this.canActivate(now)) return false; this.powerUntil = now + POWER_S; this.energy = 0; this.powerUses++; return true; }`;
  - `powerLeft(now)` dá a fração de 0 a 1 para a barra;
  - a pontuação de um acerto usa `this.score.hit(j, offset, this.powerActive(now) ? POWER_MULTIPLIER : 1)`;
  - em `resume()`, `powerUntil += dt` (se for finito);
  - em `pause()`, guarda-se a energia restante (a deslocação trata disso).
- [ ] **`Score.hit(j, offset, mult = 1)`:** `pts = POINTS[j] * this.multiplier * mult`.
- [ ] **`GameResult.powerUses`.**
- [ ] **Testes:**
  - a energia sobe com Perfeitos e Bons, não sobe com erros nem durante a energia ativa;
  - `canActivate` só com a barra cheia e na música;
  - um acerto durante a energia dá o dobro;
  - acaba ao fim de 8 s;
  - na pausa e na retoma, `powerUntil` desloca-se e o tempo restante mantém-se;
  - `powerUses` conta.
- [ ] Fazer commit: `feat: add an energy meter that doubles points for a while`.

### Task 2: Sessão, boca, desenho e textos
**Files:** `src/app/session.ts`, `src/ui/game/drawGame.ts`, `GameTrack.tsx`, `GameDialog.tsx`, `src/ui/stage/drawOverlay.ts`, `pt.ts`, `en.ts`
- [ ] **No `tick` da sessão:**
  - a deteção da cara corre se `s.mouthFx !== 'off' || s.game !== null`;
  - com `s.game !== null`, `audio.setMouth(live.mouth, 'off')` (sem efeito de som);
  - com uma ronda a correr e a música a tocar:
    - se `live.mouth >= MOUTH_ACTIVATE` e `run.activatePower(audio.now)`, toca o prato do kit (`audio.drum(kit, crashSlotFor(kit), 0.8)`) e põe o reverb a `min(1, s.reverb + POWER_REVERB_BOOST)` com `audio.setParams` (os outros parâmetros como hoje);
    - quando `powerActive` passa a falso, repõe o reverb do jogador.
  - Repõe também o reverb em `pauseGame`, `endGame` e `openGame`.
- [ ] **Textos:**
  - `game.powerReady` ("Abre a boca!" / "Open your mouth!");
  - `game.powerReadyKey` ("Espaço!" / "Space!");
  - `game.powerUses(n)` ("Energia usada: N vezes" / "Energy used: N times");
  - `game.powerMult` ("×2").
- [ ] **`drawGame`:**
  - a barra vertical à direita da pista (`run.energy`, ou `powerLeft` com a energia ativa);
  - dourada quando está cheia ou ativa;
  - o texto a pulsar com a barra cheia, usando `powerReadyKey` no modo teclado (o `GameTrack` sabe o `engine`);
  - durante a energia, um brilho dourado nos contornos da pista e dos alvos, e "×2" junto à pontuação.
- [ ] **Resultado:** `game-power-uses` quando `powerUses > 0`.
- [ ] **`drawOverlay`:** com o jogo a decorrer ou em pausa e todos os `game.fingers` do mesmo lado, não desenha a outra mão. Os pontos de `live.hands` já vêm atribuídos (a ordem e a lateralidade em `assignHands`): confirma no código como se sabe que mão é a esquerda e qual é a direita, e esconde a outra (o esqueleto e as pontas). Um getter de diagnóstico (`__vsc.live` ou `session`) diz que lado está escondido, para o e2e.
- [ ] **Capturas:** a energia cheia com "Abre a boca!", a energia ativa (dourado, ×2) e uma só mão. Guarda-as como `energy-*.png` no scratchpad e olha para elas.
- [ ] Fazer commit: `feat: activate the energy by opening the mouth and hide the idle hand`.

### Task 3: e2e e documentação
- [ ] **e2e:**
  - modo teclado, nível 1: põe `live.game.energy = 1` com o diagnóstico; durante a música, o espaço ativa a energia (`powerActive`); o acerto seguinte dá o dobro; o resultado mostra `game-power-uses`;
  - com os dedos só da mão direita, o diagnóstico diz que a mão esquerda está escondida;
  - fora do jogo, a boca e o efeito continuam como antes (um teste existente ou um novo que confirme que no modo livre o `mouthFx` continua a ser aplicado).
- [ ] **Decisão 73**, e o CHANGELOG 3.3.0.
- [ ] Verificar com `npm run test:e2e`. Fazer commit: `test: cover the energy and the hidden idle hand` e `docs: record the energy in decision 73`.
