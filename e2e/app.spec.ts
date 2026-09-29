import { expect, test, type Page } from '@playwright/test';

// Mensagens que não são erros: o WASM do MediaPipe escreve INFO em console.error.
const IGNORED = [/INFO: Created TensorFlow Lite XNNPACK delegate/];

function watchConsole(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(m.text());
  });
  return errors;
}

type Vsc = {
  session: { feedHands(h: unknown[]): void };
  syntheticHand(closed: boolean[] | boolean, x?: number, y?: number): unknown;
  store: { getState(): { instrument: string; lastNote: string; engine: string } };
};

test('liga a câmara, toca todos os instrumentos e grava', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('start').click();

  // vídeo da câmara falsa em espelho
  await expect
    .poll(() => page.evaluate(() => document.querySelector('video')?.videoWidth ?? 0), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await expect(page.getByTestId('video')).toHaveCSS('transform', 'matrix(-1, 0, 0, 1, 0, 0)');
  // o detetor das mãos carregou
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().engine),
      { timeout: 30_000 },
    )
    .toBe('hands');

  // todas as tiles de instrumento
  const tiles = page.locator('[data-testid^="tile-"]');
  const n = await tiles.count();
  expect(n).toBeGreaterThanOrEqual(29);
  for (let k = 0; k < n; k++) {
    const t = tiles.nth(k);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
  }

  // teclado (modo teclado) com um instrumento melódico
  await page.getByTestId('tile-piano').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const k of ['a', 's', 'd', 'j', 'k', 'l']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(60);
    await page.keyboard.up(k);
  }
  await expect(page.getByTestId('hud-note')).not.toHaveText('—');

  // teclado de piano com o rato
  const key = page.locator('[data-testid^="key-"]').nth(5);
  await key.hover();
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();

  // pads do kit atual
  await page.getByTestId('tile-drums').click();
  await page.getByTestId('pad-1').click();
  await expect(page.getByTestId('status-note')).toHaveText('Tarola');

  // pipeline real de gestos com mãos sintéticas: dobrar o médio esquerdo dispara uma nota
  await page.getByTestId('tile-marimba').click();
  const note = await page.evaluate(async () => {
    const v = (window as unknown as { __vsc: Vsc }).__vsc;
    const open = [v.syntheticHand(false, 0.3), v.syntheticHand(false, 0.7)];
    const bent = [
      v.syntheticHand([false, false, true, false, false], 0.3),
      v.syntheticHand(false, 0.7),
    ];
    const wait = () => new Promise((r) => setTimeout(r, 33));
    for (const hands of [open, open, open, open, bent, bent, bent, bent]) {
      v.session.feedHands(hands);
      await wait();
    }
    return v.store.getState().lastNote;
  });
  expect(note).toMatch(/^(Dó|Ré|Mi|Fá|Sol|Lá|Si)♯?\d$/);

  // gravar 2 s
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pad-0').click();
  await page.waitForTimeout(2000);
  await page.getByTestId('record').click();
  await expect(page.getByTestId('recording-item')).toHaveCount(1, { timeout: 10_000 });

  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('sem internet', () => {
  test.use({ serviceWorkers: 'allow' });

  test('funciona offline depois do primeiro carregamento', async ({ page, context }) => {
    const errors = watchConsole(page);
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // espera que o service worker controle a página e tenha a cache pronta
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('start').click();
    await expect(page.getByRole('status').filter({ hasText: /Pronto|Mostra/ })).toBeVisible({
      timeout: 30_000,
    });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
