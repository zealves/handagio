import { expect, test, type Page } from '@playwright/test';

type Run = {
  times: number[];
  chart: { notes: { lane: number }[] };
  score: { points: number; perfect: number; good: number; wrongTaps: number };
  state: 'countdown' | 'playing' | 'paused' | 'over';
  judge: { state: Uint8Array };
  last: { kind: string; at: number } | null;
  countTo: number;
  viewNow(now: number): number;
};
type Vsc = {
  session: {
    gameBars: number | null;
    startLevel(id: string): void;
    restartGame(): void;
    nextLevel(): void;
    pauseGame(): void;
    readonly gameMelody: string | null;
  };
  audio: { now: number; voiceMidi(key: number | string): number | null };
  live: { game: Run | null };
  store: { getState(): Record<string, unknown> & { set(p: Record<string, unknown>): void } };
};
const field = (page: Page, k: string) =>
  page.evaluate((k) => (window as unknown as { __vsc: Vsc }).__vsc.store.getState()[k], k);
const liveGame = (page: Page) =>
  page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.live.game);

/**
 * Prime as primeiras `n` notas da ronda pela tecla e o dedo de cada faixa (por omissão, os do
 * Fácil: d f j k / 2 1 6 7). Com `pendingOnly`, salta as notas já julgadas e as que já não estão
 * no futuro, primindo só as próximas por julgar (usado a seguir a uma pausa, com os tempos já
 * deslocados). Devolve os acertos (Perfeito + Bom) só desta chamada, não o total acumulado da
 * ronda.
 */
function hitNotes(
  page: Page,
  n: number,
  keys: string[] = ['d', 'f', 'j', 'k'],
  fingers: number[] = [2, 1, 6, 7],
  pendingOnly = false,
) {
  return page.evaluate(
    async ({ n, keys, fingers, pendingOnly }) => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      const run = v.live.game!;
      const startHits = run.score.perfect + run.score.good;
      let voice = false;
      let count = 0;
      for (let k = 0; k < run.times.length && count < n; k++) {
        if (pendingOnly && (run.judge.state[k] !== 0 || run.times[k] <= v.audio.now)) continue;
        count++;
        const lane = run.chart.notes[k].lane;
        while (v.audio.now < run.times[k]) await new Promise((r) => setTimeout(r, 2));
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: keys[lane], bubbles: true }),
        );
        if (v.audio.voiceMidi(fingers[lane]) !== null) voice = true;
        await new Promise((r) => setTimeout(r, 30));
        document.body.dispatchEvent(new KeyboardEvent('keyup', { key: keys[lane], bubbles: true }));
      }
      return { hits: run.score.perfect + run.score.good - startHits, count, voice };
    },
    { n, keys, fingers, pendingOnly },
  );
}

/** Começa o nível 1 (Pop), já selecionado por omissão no menu sem separadores. */
async function startEasy(page: Page) {
  await page.getByTestId('mode-game').click();
  const dlg = page.getByTestId('game-dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('game-start').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('game-track')).toBeVisible();
}

/** Começa um nível pelo seu cartão, na lista de níveis (já sem separadores). */
async function startLevel(page: Page, id: string) {
  await page.getByTestId('mode-game').click();
  const dlg = page.getByTestId('game-dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId(`game-level-card-${id}`).click();
  await dlg.getByTestId('game-start').click();
  await expect(dlg).toBeHidden();
  await expect(page.getByTestId('game-track')).toBeVisible();
}

test.describe('modo de jogo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?debug');
    await page.getByTestId('start-touch').click();
  });

  test('Fácil no teclado: acertos tocam a melodia, atalhos bloqueados, Esc pausa', async ({
    page,
  }) => {
    // com uma bateria escolhida, a melodia toca no piano
    await page.evaluate(() =>
      (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'drums' }),
    );
    await startEasy(page);
    await expect(page.getByTestId('pills')).toHaveCount(0);
    // o HUD (nota, loop, câmara…) ficaria por cima da pontuação e com ações que não fazem
    // sentido a meio de uma ronda
    await expect(page.getByTestId('hud')).toHaveCount(0);
    const r = await hitNotes(page, 3);
    expect(r.hits).toBe(r.count);
    expect(r.voice).toBe(true);
    // atalho de instrumento não muda nada a meio do jogo
    await page.keyboard.press('.');
    expect(await field(page, 'instrument')).toBe('drums');
    // Esc pausa (não sai); a pista continua visível, congelada, por trás do cartão
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await expect(page.getByTestId('game-track')).toBeVisible();
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('paused');
    // um segundo Esc continua a ronda (o `cancel` do <dialog> muda logo a fase; se o browser
    // fechar sem `cancel`, só o `close` a seguir a muda, por isso espera-se a fase)
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeHidden();
    await expect
      .poll(async () => ((await field(page, 'game')) as { phase: string }).phase)
      .toBe('playing');
    // sair: o ✕ da pista volta ao menu do jogo (não ao livre), com a ronda já terminada
    await page.getByTestId('game-exit').click();
    await expect(page.getByTestId('game-track')).toHaveCount(0);
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('game-start')).toBeVisible();
    // como na pausa e no resultado, o foco fica no Jogar, com o cartão visto do topo
    await expect(dlg.getByTestId('game-start')).toBeFocused();
    await expect(dlg.getByTestId('game-start')).toHaveText('Jogar');
    expect(await dlg.evaluate((el) => el.scrollTop)).toBe(0);
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('setup');
    expect(await liveGame(page)).toBeNull();
  });

  test('ronda curta: resultado, recorde guardado e jogar outra vez', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startEasy(page);
    const r = await hitNotes(page, 99);
    expect(r.hits).toBeGreaterThan(0);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-new-best')).toBeVisible();
    expect(
      ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop.points,
    ).toBeGreaterThan(0);
    await page.getByTestId('game-again').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    await page.getByTestId('game-exit').click();
    await expect(page.getByTestId('game-track')).toHaveCount(0);
  });

  test('menu no resultado: volta ao menu em vez de recomeçar logo', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startEasy(page);
    await hitNotes(page, 99);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('game-menu').click();
    await expect(result).toBeHidden();
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('setup');
    await expect(page.getByTestId('game-dialog').getByTestId('game-start')).toBeVisible();
  });

  test('Esc no resultado volta ao menu com o Jogar focado', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startEasy(page);
    await hitNotes(page, 99);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(result).toBeHidden();
    await expect
      .poll(async () => ((await field(page, 'game')) as { phase: string } | null)?.phase)
      .toBe('setup');
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('game-start')).toBeFocused();
    expect(await dlg.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test('Esc no menu sai para o livre', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect.poll(() => field(page, 'game')).toBeNull();
    await expect(page.getByTestId('pills')).toBeVisible();
  });

  test('Esc logo a seguir a abrir o menu sai para o livre', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    // sem esperar pelo cartão visível: o Esc chega logo a seguir ao `showModal()`
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-dialog')).toBeHidden();
    await expect.poll(() => field(page, 'game')).toBeNull();
  });

  test('pausa e Esc continua a ronda', async ({ page }) => {
    await startEasy(page);
    await page.keyboard.press('p');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeHidden();
    await expect
      .poll(async () => ((await field(page, 'game')) as { phase: string }).phase)
      .toBe('playing');
    await expect(page.getByTestId('game-dialog')).toBeHidden();
  });

  test('pausar logo a seguir a Jogar fica em pausa', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    // o `close` do cartão do menu chega numa tarefa à parte, já com o <dialog> aberto na pausa
    const result = await page.evaluate(async () => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      const d = document.querySelector<HTMLDialogElement>('[data-testid="game-dialog"]')!;
      v.session.startLevel('pop');
      // deixa o React fechar o cartão (microtarefas), mas pausa antes da tarefa do `close`
      for (let i = 0; i < 5; i++) await Promise.resolve();
      const closed = !d.open;
      v.session.pauseGame();
      // esvazia a fila: o `close` antigo chega numa destas tarefas
      for (let i = 0; i < 2; i++) await new Promise((r) => setTimeout(r, 0));
      const phase = (v.store.getState().game as { phase: string } | null)?.phase;
      return { closed, phase, open: d.open };
    });
    expect(result).toEqual({ closed: true, phase: 'paused', open: true });
    await expect(page.getByTestId('game-paused')).toBeVisible();
  });

  // sem interação desde a abertura, o browser fecha o <dialog> sem `cancel` ou com um `cancel`
  // que não se pode cancelar; simula-se aqui com eventos sintéticos e `d.close()`
  const closeLikeBrowser = (page: Page, withCancel: boolean) =>
    page.evaluate(async (withCancel) => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      const d = document.querySelector<HTMLDialogElement>('[data-testid="game-dialog"]')!;
      if (withCancel) d.dispatchEvent(new Event('cancel', { cancelable: false }));
      d.close();
      for (let i = 0; i < 2; i++) await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(r));
      const g = v.store.getState().game as { phase: string } | null;
      return { phase: g?.phase ?? null, open: d.open };
    }, withCancel);

  async function reachResult(page: Page) {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startEasy(page);
    await hitNotes(page, 99);
    await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 15_000 });
  }

  test('resultado: cancel que não se pode cancelar volta ao menu só uma vez', async ({ page }) => {
    await reachResult(page);
    expect(await closeLikeBrowser(page, true)).toEqual({ phase: 'setup', open: true });
    await expect(page.getByTestId('game-dialog').getByTestId('game-start')).toBeVisible();
  });

  test('resultado: fecho do browser sem cancel volta ao menu', async ({ page }) => {
    await reachResult(page);
    expect(await closeLikeBrowser(page, false)).toEqual({ phase: 'setup', open: true });
    await expect(page.getByTestId('game-dialog').getByTestId('game-start')).toBeVisible();
  });

  test('menu: fecho do browser sem cancel sai para o livre', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    await expect(page.getByTestId('game-dialog')).toBeVisible();
    expect(await closeLikeBrowser(page, false)).toEqual({ phase: null, open: false });
    await expect(page.getByTestId('pills')).toBeVisible();
  });

  test('esconder o separador pausa a partida sem recorde', async ({ page }) => {
    await startEasy(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('game-paused')).toBeVisible();
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('paused');
    expect(
      ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop,
    ).toBeUndefined();
  });

  test('início: o botão Jogar abre o cartão do jogo', async ({ page }) => {
    // usa o mesmo arranque com câmara falsa que os outros testes de câmara de app.spec.ts: a
    // câmara falsa do Chromium (--use-fake-device-for-media-stream) está configurada para todo o
    // projeto em playwright.config.ts, não só para alguns testes, por isso chega ir direto ao
    // start-game sem nenhuma preparação extra
    await page.goto('/?debug');
    await page.getByTestId('start-game').click();
    // abre logo que a câmara abre, sem esperar pelos detetores (decisão 68)
    await expect(page.getByTestId('game-dialog')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('mode-game')).toHaveAttribute('aria-pressed', 'true');
  });

  test('interruptor Livre | Jogo', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    await expect(page.getByTestId('game-dialog')).toBeVisible();
    await page.getByTestId('game-dialog').getByTestId('game-start').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    await page.getByTestId('mode-free').click();
    await expect(page.getByTestId('game-track')).toHaveCount(0);
    expect(await field(page, 'game')).toBeNull();
  });

  test('atalho só a mão direita: liga as 4 faixas certas', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await dlg.getByTestId('game-preset-right').click();
    expect(await field(page, 'gameFingers')).toEqual([6, 7, 8, 9]);
    await expect(dlg.getByTestId('game-preset-right')).toHaveAttribute('aria-pressed', 'true');
    await expect(dlg.getByTestId('game-lanes')).toContainText('4');
  });

  test('só a mão direita dedo a dedo: 4 faixas nas teclas J K L Ç', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    // de [2,1,6,7] para [6,7,8,9]: liga 8 e 9, desliga 2 e 1
    await dlg.getByTestId('game-finger-8').click();
    await dlg.getByTestId('game-finger-9').click();
    await dlg.getByTestId('game-finger-2').click();
    await dlg.getByTestId('game-finger-1').click();
    await expect(dlg.getByTestId('game-lanes')).toContainText('4');
    expect(await field(page, 'gameFingers')).toEqual([6, 7, 8, 9]);
    await dlg.getByTestId('game-start').click();
    const r = await hitNotes(page, 3, ['j', 'k', 'l', 'ç'], [6, 7, 8, 9]);
    expect(r.hits).toBe(r.count);
  });

  test('toque fora da janela, durante a música, soa e conta como errado', async ({ page }) => {
    await startEasy(page);
    const r = await page.evaluate(async () => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      const run = v.live.game!;
      // escolhe o maior intervalo entre notas julgáveis (contando o da contagem à 1.ª nota) e
      // espera pelo seu meio: longe o bastante (> 0,35 s de cada lado, a janela do juiz) para o
      // toque ser mesmo um errado, não um acerto por sorte
      const bounds = [run.countTo, ...run.times];
      let best = { gap: -1, mid: 0 };
      for (let i = 1; i < bounds.length; i++) {
        const gap = bounds[i] - bounds[i - 1];
        if (gap > best.gap) best = { gap, mid: (bounds[i] + bounds[i - 1]) / 2 };
      }
      if (best.gap < 0.7) throw new Error(`sem intervalo longo o bastante (maior: ${best.gap}s)`);
      while (v.audio.now < best.mid) await new Promise((res) => setTimeout(res, 2));
      const before = run.score.wrongTaps;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      const on = v.audio.voiceMidi(2) !== null;
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
      // só conta depois da tolerância do vizinho (0,15 s sem um acerto ao lado)
      const tapAt = v.audio.now;
      while (v.audio.now < tapAt + 0.25) await new Promise((res) => setTimeout(res, 5));
      return { on, wrong: run.score.wrongTaps - before };
    });
    expect(r.on).toBe(true);
    expect(r.wrong).toBe(1);
  });

  test('pausa: P e o botão; nada muda em pausa; continuar volta a contar', async ({ page }) => {
    await startEasy(page);
    await hitNotes(page, 1);
    await page.keyboard.press('p');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    const before = await page.evaluate(() => {
      const g = (window as unknown as { __vsc: Vsc }).__vsc.live.game!;
      return { points: g.score.points, states: Array.from(g.judge.state) };
    });
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => {
      const g = (window as unknown as { __vsc: Vsc }).__vsc.live.game!;
      return { points: g.score.points, states: Array.from(g.judge.state) };
    });
    expect(after).toEqual(before);
    await page.getByTestId('game-resume').click();
    await expect(page.getByTestId('game-paused')).toBeHidden();
    // o hitNotes espera pelos tempos (já deslocados) das próximas notas por julgar
    const r = await hitNotes(page, 2, undefined, undefined, true);
    expect(r.hits).toBe(r.count);
    await page.getByTestId('game-pause').click();
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.getByTestId('game-restart').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
  });

  test('menu na pausa: acaba a ronda sem recorde e dá para recomeçar', async ({ page }) => {
    await startEasy(page);
    await hitNotes(page, 1);
    await page.keyboard.press('p');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.getByTestId('game-menu').click();
    await expect(page.getByTestId('game-paused')).toBeHidden();
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('setup');
    expect(await liveGame(page)).toBeNull();
    expect(
      ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop,
    ).toBeUndefined();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg.getByTestId('game-start')).toBeVisible();
    await dlg.getByTestId('game-start').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
  });

  test('o botão Modo livre no menu sai para o livre', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await dlg.getByTestId('game-free').click();
    await expect(dlg).toBeHidden();
    expect(await field(page, 'game')).toBeNull();
    await expect(page.getByTestId('pills')).toBeVisible();
  });

  test('os polegares não jogam: botões desativados no seletor', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg.getByTestId('game-finger-0')).toBeDisabled();
    await expect(dlg.getByTestId('game-finger-5')).toBeDisabled();
  });

  test('mínimo de 2 dedos: os dois que restam ficam desativados', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await dlg.getByTestId('game-preset-pairs').click();
    expect(await field(page, 'gameFingers')).toEqual([2, 1, 6, 7]);
    await dlg.getByTestId('game-finger-1').click();
    await dlg.getByTestId('game-finger-7').click();
    expect(await field(page, 'gameFingers')).toEqual([2, 6]);
    await expect(dlg.getByTestId('game-finger-2')).toBeDisabled();
    await expect(dlg.getByTestId('game-finger-6')).toBeDisabled();
    await expect(dlg.getByTestId('game-lanes')).toContainText('2');
  });

  test('avançado: fechado por defeito, o atraso só aparece ao abrir', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    const advanced = dlg.getByTestId('game-advanced');
    expect(await advanced.evaluate((el: HTMLDetailsElement) => el.open)).toBe(false);
    await expect(dlg.getByTestId('game-lag')).toBeHidden();
    await advanced.locator('summary').click();
    expect(await advanced.evaluate((el: HTMLDetailsElement) => el.open)).toBe(true);
    await expect(dlg.getByTestId('game-lag')).toBeVisible();
  });

  test('320×568: cada dedo é visível, a pílula toca sempre no seu botão e tem a sua faixa', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?debug');
    await page.getByTestId('start-touch').click();
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    // abaixo de 400 px os alvos alargados (`::before`) dos vizinhos sobrepõem-se uns aos outros:
    // duas mãos de cinco dedos não cabem com 44 px cada em 320 px (exceção da decisão 69). Por
    // isso mede-se o que um toque acerta de facto: toda a pílula tem de acertar no seu botão e
    // cada dedo tem uma faixa só sua com, pelo menos, o passo da fila (pílula de 22 px + 3 px de
    // intervalo: mais do que isso só tirando a um vizinho) de largura e ≥44 px de altura
    for (const f of [1, 2, 3, 4, 6, 7, 8, 9]) {
      const id = `game-finger-${f}`;
      const el = dlg.getByTestId(id);
      await el.scrollIntoViewIfNeeded();
      await expect(el, id).toBeInViewport({ ratio: 1 });
      const m = await el.evaluate((btn) => {
        const hits = (x: number, y: number) =>
          document.elementFromPoint(x, y)?.closest('button') === btn;
        const pill = btn.querySelector('span')!.getBoundingClientRect();
        // só os pontos dentro da forma visível da pílula (topo em meia-lua, cantos de baixo com
        // 10 px de raio): os cantos arredondados não contam como pílula para o toque
        const r = pill.width / 2;
        const inside = (x: number, y: number) => {
          const dx = x - (pill.left + r);
          if (y < pill.top + r) return dx * dx + (y - pill.top - r) ** 2 <= (r - 1) ** 2;
          const rb = 10;
          const by = pill.bottom - rb;
          if (y > by && Math.abs(dx) > r - rb)
            return (Math.abs(dx) - (r - rb)) ** 2 + (y - by) ** 2 <= (rb - 1) ** 2;
          return true;
        };
        // pontos a meio de cada píxel da pílula (as margens podem cair a meio píxel)
        let pillMiss = 0;
        for (let x = pill.left + 0.5; x < pill.right; x++)
          for (let y = pill.top + 0.5; y < pill.bottom; y += 2)
            if (inside(x, y) && !hits(x, y)) pillMiss++;
        const box = btn.getBoundingClientRect();
        const cx = (box.left + box.right) / 2;
        const cy = box.bottom - 2;
        let left = cx;
        while (hits(left - 1, cy)) left--;
        let right = cx;
        while (hits(right + 1, cy)) right++;
        let top = cy;
        while (hits(cx, top - 1)) top--;
        let bottom = cy;
        while (hits(cx, bottom + 1)) bottom++;
        return { pillMiss, width: right - left + 1, height: bottom - top + 1 };
      });
      expect(m.pillMiss, `${id}: pontos da pílula fora do botão`).toBe(0);
      expect(m.width, `${id}: largura só sua`).toBeGreaterThanOrEqual(25);
      expect(m.height, `${id}: altura`).toBeGreaterThanOrEqual(44);
    }
  });

  test('menu sem separadores nem Treino: só a lista dos níveis, com o nível 1 aberto e os níveis 2 e 3 bloqueados', async ({
    page,
  }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    // sem separadores (decisão 71): nem Níveis/Treino, nem a dificuldade do Treino
    await expect(dlg.locator('[data-testid^="game-tab-"]')).toHaveCount(0);
    await expect(dlg.getByTestId('game-level-easy')).toHaveCount(0);
    await expect(dlg.getByTestId('game-level-medium')).toHaveCount(0);
    await expect(dlg.getByTestId('game-level-hard')).toHaveCount(0);
    await expect(dlg.getByTestId('game-instrument')).toHaveCount(0);
    await expect(dlg.getByTestId('game-level-card-pop')).toBeEnabled();
    await expect(dlg.getByTestId('game-level-card-pop')).toHaveAttribute('aria-pressed', 'true');
    await expect(dlg.getByTestId('game-level-card-lofi')).toBeDisabled();
    await expect(dlg.getByTestId('game-level-card-electro')).toBeDisabled();
    // a condição de desbloqueio não fica só no `title` (sem tooltip no toque, e os cartões
    // bloqueados são `disabled`, logo nunca recebem foco): ganha também uma linha visível
    await expect(dlg.getByTestId('game-unlock-hint')).toBeVisible();
    await expect(dlg.getByTestId('game-unlock-hint')).toContainText('50%');
  });

  test('nível 1 completo: estrelas, desbloqueio, o nível 2 pelo botão Próximo, e o progresso sobrevive a um recarregamento', async ({
    page,
  }) => {
    const before = await field(page, 'instrument');
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startLevel(page, 'pop');
    const r = await hitNotes(page, 99);
    expect(r.hits).toBeGreaterThan(0);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-stars')).toBeVisible();
    await expect(page.getByTestId('game-unlocked')).toBeVisible();
    expect(
      ((await field(page, 'levelProgress')) as Record<string, { stars: number }>).pop.stars,
    ).toBeGreaterThanOrEqual(1);
    // o progresso não muda o instrumento escolhido fora do jogo
    expect(await field(page, 'instrument')).toBe(before);

    await page.getByTestId('game-next').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.gameMelody),
    ).toBe('epiano');
    expect(((await field(page, 'game')) as { levelId: string | null }).levelId).toBe('lofi');
    await page.getByTestId('game-exit').click();

    // recarrega: o progresso guardado (localStorage, `persist`) mantém o nível 2 aberto e as
    // estrelas do 1
    await page.reload();
    await page.getByTestId('start-touch').click();
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.getByTestId('game-level-card-lofi')).toBeEnabled();
    const popStars = dlg.getByTestId('game-level-card-pop').getByRole('img');
    await expect(popStars).toHaveAttribute('aria-label', /^[1-3] de 3 estrelas$/);
  });

  test('"Repetir" num nível repete o mesmo nível', async ({ page }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startLevel(page, 'pop');
    await hitNotes(page, 99);
    await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('game-again').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    expect(((await field(page, 'game')) as { levelId: string | null }).levelId).toBe('pop');
  });

  test('nível: o recorde acompanha o progresso do próprio nível, "Novo recorde!" repete-se ao melhorá-lo e o recorde fica escondido enquanto o for', async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    await startLevel(page, 'pop');
    // só 1 acerto: poucos pontos, mas é o 1.º recorde deste nível (antes da correção, o
    // resultado dos níveis nunca marcava `best`, por mais pontos que tivesse). Sendo um novo
    // recorde, "level-best" (o recorde de antes) fica escondido: seria redundante com "Novo
    // recorde!"
    await hitNotes(page, 1);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-new-best')).toBeVisible();
    await expect(page.getByTestId('level-best')).toHaveCount(0);
    const first = ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop
      .points;
    expect(first).toBeGreaterThan(0);

    await page.getByTestId('game-again').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    const r = await hitNotes(page, 99);
    expect(r.hits).toBeGreaterThan(0);
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-new-best')).toBeVisible();
    await expect(page.getByTestId('level-best')).toHaveCount(0);
    const second = ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop
      .points;
    expect(second).toBeGreaterThan(first);

    // uma 3.ª ronda pior (sem nenhum acerto) já não bate o recorde: "Novo recorde!" desaparece e
    // "level-best" mostra-o, visível desta vez
    await page.getByTestId('game-again').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    await hitNotes(page, 0);
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-new-best')).toHaveCount(0);
    await expect(page.getByTestId('level-best')).toBeVisible();
    await expect(page.getByTestId('level-best')).toContainText(String(second));
    expect(
      ((await field(page, 'levelProgress')) as Record<string, { points: number }>).pop.points,
    ).toBe(second);
  });

  test('silêncio fora da música: no menu, na contagem e no resultado nenhuma tecla de dedo toca', async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    const press = () =>
      page.evaluate(() => {
        const v = (window as unknown as { __vsc: Vsc }).__vsc;
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
        const on = v.audio.voiceMidi(2);
        document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
        return on;
      });

    // no menu: a ronda interna nem existe (`session.game` continua `null`), por isso o dedo não
    // soa nada, nem a nota livre
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    expect(await press()).toBeNull();

    // começa o nível: a ronda já existe, mas a contagem ainda não acabou (`isMusicTime` é falso)
    await dlg.getByTestId('game-start').click();
    await expect(dlg).toBeHidden();
    await expect(page.getByTestId('game-track')).toBeVisible();
    const stillCounting = await page.evaluate(() => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      return v.audio.now < v.live.game!.countTo;
    });
    expect(stillCounting).toBe(true);
    expect(await press()).toBeNull();

    // chega ao resultado (fora da música outra vez) e confirma o mesmo silêncio
    await hitNotes(page, 99);
    await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 15_000 });
    expect(await press()).toBeNull();
  });

  test('premir todas as faixas sem parar dá toques errados e uma precisão pior que uma ronda limpa', async ({
    page,
  }) => {
    await page.evaluate(() => {
      (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
    });
    // ronda limpa: só os acertos certos, sem nenhum toque errado
    await startEasy(page);
    await hitNotes(page, 99);
    await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 15_000 });
    const clean = ((await field(page, 'game')) as { result: { accuracy: number } }).result;
    await expect(page.getByTestId('game-wrong-taps')).toHaveCount(0);

    // ronda da trapalhada: carrega nas 4 teclas sem parar, sem olhar ao tempo das notas
    await page.getByTestId('game-again').click();
    await expect(page.getByTestId('game-track')).toBeVisible();
    await page.evaluate(async () => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      const run = v.live.game!;
      const keys = ['d', 'f', 'j', 'k'];
      while (run.state !== 'over') {
        for (const k of keys) {
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
          document.body.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
        }
        await new Promise((r) => setTimeout(r, 15));
      }
    });
    await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 15_000 });
    const messy = (
      (await field(page, 'game')) as { result: { accuracy: number; wrongTaps: number } }
    ).result;
    expect(messy.wrongTaps).toBeGreaterThan(0);
    expect(messy.accuracy).toBeLessThan(clean.accuracy);
    await expect(page.getByTestId('game-wrong-taps')).toBeVisible();
    await expect(page.getByTestId('game-wrong-taps')).toContainText(String(messy.wrongTaps));
  });

  test('no último nível, com o progresso posto a dedo e 0 estrelas, não aparece a dica de desbloqueio', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      v.session.gameBars = 2;
      // abre o último nível (eletrónico) sem jogar os anteriores: 3 estrelas nos dois primeiros
      v.store.getState().set({
        levelProgress: {
          pop: { stars: 3, points: 500, accuracy: 1 },
          lofi: { stars: 3, points: 500, accuracy: 1 },
        },
      });
    });
    await startLevel(page, 'electro');
    // sem nenhum toque: 0 estrelas garantidas (precisão 0)
    await hitNotes(page, 0);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('game-stars')).toHaveAttribute('aria-label', '0 de 3 estrelas');
    // o eletrónico é o último nível (sem `next`): a dica nunca aparece, mesmo com 0 estrelas
    await expect(page.getByTestId('game-unlock-hint')).toHaveCount(0);
  });
});
