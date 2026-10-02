import { expect, test, type Page } from '@playwright/test';

type Run = {
  times: number[];
  chart: { notes: { lane: number }[] };
  score: { points: number; perfect: number; good: number };
  state: 'countdown' | 'playing' | 'paused' | 'over';
  judge: { state: Uint8Array };
  last: { kind: string; at: number } | null;
  countTo: number;
  viewNow(now: number): number;
};
type Vsc = {
  session: { gameBars: number | null };
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

async function startEasy(page: Page) {
  await page.getByTestId('mode-game').click();
  const dlg = page.getByTestId('game-dialog');
  await expect(dlg).toBeVisible();
  await dlg.getByTestId('game-level-easy').click();
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
    // um segundo Esc continua a ronda; o evento `close` nativo do <dialog> só dispara numa
    // tarefa à parte (fica hidden antes de a fase mudar), por isso aqui espera-se a fase
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
    expect(((await field(page, 'gameBest')) as { easy: number }).easy).toBeGreaterThan(0);
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

  // BUG CONHECIDO (ver task-3-report.md): o Esc no resultado chama `closeForPhase` → `backToMenu`,
  // que muda a fase para `setup` sem nunca tornar `open` falso (fica `true` em `over` e em
  // `setup`), por isso o efeito de `GameDialog.tsx` que chama `showModal()` (key `[open]`) não
  // volta a correr; o Esc já tinha fechado o `<dialog>` nativo (o cancel/close por omissão do
  // Escape), por isso o cartão fica fechado apesar de a fase já ser `setup`. `game-menu` (clique)
  // não tem este problema: nunca chama `d.close()`, o `<dialog>` nunca fecha de verdade.
  test.fail(
    'Esc no resultado volta ao menu em vez de sair para o livre',
    async ({ page }) => {
      await page.evaluate(() => {
        (window as unknown as { __vsc: Vsc }).__vsc.session.gameBars = 2;
      });
      await startEasy(page);
      await hitNotes(page, 99);
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible({ timeout: 15_000 });
      await page.keyboard.press('Escape');
      await expect(result).toBeHidden();
      // o `close` nativo do <dialog> chega numa tarefa à parte (ver comentário em GameDialog.tsx)
      await expect
        .poll(async () => ((await field(page, 'game')) as { phase: string } | null)?.phase)
        .toBe('setup');
      await expect(page.getByTestId('game-dialog')).toBeVisible();
    },
  );

  // BUG CONHECIDO (ver task-3-report.md): o mesmo `<dialog>` nativo que fecha sozinho com o Esc
  // (cancel/close por omissão) tem uma corrida independente da fase: ao contrário de um clique em
  // `game-menu`/`game-free` (que nunca chama `d.close()` e por isso nunca passa por esta corrida),
  // o Esc por vezes fecha o `<dialog>` sem que `onNativeClose` chegue a chamar `closeForPhase`
  // (confirmado isolando `session.stopGame`/`openGame`: `stopGame` nunca é chamado nesses casos),
  // por isso `game` fica por vezes como estava antes do Esc. É uma corrida de tempo (~50–75% das
  // vezes nos testes manuais), não determinística, por isso fica marcado `fixme` em vez de
  // `test.fail` (que exigiria falhar sempre): correr sempre seria instável nos dois sentidos.
  test.fixme('Esc no menu sai para o livre', async ({ page }) => {
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    expect(await field(page, 'game')).toBeNull();
  });

  test('esconder o separador pausa a partida sem recorde', async ({ page }) => {
    await startEasy(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('game-paused')).toBeVisible();
    expect(((await field(page, 'game')) as { phase: string }).phase).toBe('paused');
    expect(((await field(page, 'gameBest')) as { easy: number }).easy).toBe(0);
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

  test('toque fora da janela soa na mesma', async ({ page }) => {
    await startEasy(page);
    const sounded = await page.evaluate(async () => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
      const on = v.audio.voiceMidi(2) !== null;
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', bubbles: true }));
      return on;
    });
    expect(sounded).toBe(true);
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
    expect(((await field(page, 'gameBest')) as { easy: number }).easy).toBe(0);
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

  test('320×568: os dedos das pontas ficam visíveis e tocáveis no cartão', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/?debug');
    await page.getByTestId('start-touch').click();
    await page.getByTestId('mode-game').click();
    const dlg = page.getByTestId('game-dialog');
    await expect(dlg).toBeVisible();
    for (const id of ['game-finger-1', 'game-finger-6', 'game-finger-9']) {
      const el = dlg.getByTestId(id);
      await el.scrollIntoViewIfNeeded();
      await expect(el, id).toBeInViewport({ ratio: 1 });
      // o alvo de toque alarga para 44×44 por um `::before` absoluto (ver FingerPicker.module.css:
      // "alvo de toque ≥44×44: por cima da pílula"), sem alargar a fila — por isso mede-se o
      // pseudo-elemento, não a caixa do próprio botão (mais estreita que a pílula visível)
      const target = await el.evaluate((e) => {
        const cs = getComputedStyle(e, '::before');
        return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
      });
      expect(Math.min(target.width, target.height), id).toBeGreaterThanOrEqual(44);
    }
  });
});
