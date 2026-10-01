import { expect, test, type Page } from '@playwright/test';

type Run = {
  times: number[];
  chart: { notes: { lane: number }[] };
  score: { points: number; perfect: number; good: number };
};
type Vsc = {
  session: { gameBars: number | null };
  audio: { now: number; voiceMidi(key: number | string): number | null };
  live: { game: Run | null };
  store: { getState(): Record<string, unknown> & { set(p: Record<string, unknown>): void } };
};
const field = (page: Page, k: string) =>
  page.evaluate((k) => (window as unknown as { __vsc: Vsc }).__vsc.store.getState()[k], k);

/** Prime a tempo (tecla d f j k = faixas do Fácil) as primeiras `n` notas da ronda. */
function hitNotes(page: Page, n: number) {
  return page.evaluate(async (n) => {
    const v = (window as unknown as { __vsc: Vsc }).__vsc;
    const run = v.live.game!;
    const keys = ['d', 'f', 'j', 'k'];
    const fingers = [2, 1, 6, 7];
    let voice = false;
    const count = Math.min(n, run.times.length);
    for (let k = 0; k < count; k++) {
      const lane = run.chart.notes[k].lane;
      while (v.audio.now < run.times[k]) await new Promise((r) => setTimeout(r, 2));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: keys[lane], bubbles: true }));
      if (v.audio.voiceMidi(fingers[lane]) !== null) voice = true;
      await new Promise((r) => setTimeout(r, 30));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { key: keys[lane], bubbles: true }));
    }
    return { hits: run.score.perfect + run.score.good, count, voice };
  }, n);
}

async function startEasy(page: Page) {
  await page.getByTestId('game-open').click();
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

  test('Fácil no teclado: acertos tocam a melodia, atalhos bloqueados, Esc sai', async ({
    page,
  }) => {
    // com uma bateria escolhida, a melodia toca no piano
    await page.evaluate(() =>
      (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'drums' }),
    );
    await startEasy(page);
    await expect(page.getByTestId('pills')).toHaveCount(0);
    const r = await hitNotes(page, 3);
    expect(r.hits).toBe(r.count);
    expect(r.voice).toBe(true);
    // atalho de instrumento não muda nada a meio do jogo
    await page.keyboard.press('.');
    expect(await field(page, 'instrument')).toBe('drums');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-track')).toHaveCount(0);
    expect(await field(page, 'game')).toBeNull();
    await expect(page.getByTestId('pills')).toBeVisible();
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

  test('esconder o separador termina a partida sem recorde', async ({ page }) => {
    await startEasy(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByTestId('game-track')).toHaveCount(0);
    expect(await field(page, 'game')).toBeNull();
    expect(((await field(page, 'gameBest')) as { easy: number }).easy).toBe(0);
  });
});
