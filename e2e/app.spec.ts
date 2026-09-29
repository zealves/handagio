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
  store: {
    getState(): {
      instrument: string;
      lastNote: string;
      engine: string;
      uiHidden: boolean;
      stageBg: string;
      set(p: Record<string, unknown>): void;
    };
  };
};

async function startCamera(page: Page) {
  await page.getByTestId('start').click();
  await expect
    .poll(
      () =>
        page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().engine),
      { timeout: 30_000 },
    )
    .toBe('hands');
}

/** Dobra o médio esquerdo com mãos sintéticas e devolve a última nota. */
function playSynthetic(page: Page) {
  return page.evaluate(async () => {
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
}

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

  // gaveta dos instrumentos: todas as filas
  await page.getByTestId('chip-instrument').click();
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  const tiles = drawer.locator('[data-testid^="tile-"]');
  const n = await tiles.count();
  expect(n).toBeGreaterThanOrEqual(29);
  for (let k = 0; k < n; k++) {
    const t = tiles.nth(k);
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
  }

  // pesquisa sem acentos; escrever não toca notas nem dispara atalhos
  const search = page.getByTestId('instrument-search');
  await search.fill('mari');
  await expect(drawer.locator('[data-testid^="tile-"]')).toHaveCount(1);
  // teclas reais (fill não dispara keydown): as guardas de isTypingTarget têm de as ignorar
  const snapshot = () =>
    page.evaluate(() => {
      const st = (window as unknown as { __vsc: Vsc }).__vsc.store.getState();
      return { uiHidden: st.uiHidden, instrument: st.instrument, lastNote: st.lastNote };
    });
  const typedFrom = await snapshot();
  expect(typedFrom.uiHidden).toBe(false);
  await search.fill('');
  await search.focus();
  await search.pressSequentially('asdf ie.,', { delay: 30 });
  await expect(search).toHaveValue('asdf ie.,');
  await expect(page.getByText('Nenhum instrumento encontrado.')).toBeVisible();
  // nenhum atalho (I, , e .) nem nota do modo teclado reagiu
  expect(await snapshot()).toEqual(typedFrom);
  await expect(page.getByTestId('hud-note')).toHaveText('—');
  await search.fill('');
  await drawer.getByTestId('tile-piano').click();

  // Esc fecha e devolve o foco ao chip
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('chip-instrument')).toBeFocused();

  // teclado (modo teclado) com um instrumento melódico
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const k of ['a', 's', 'd', 'j', 'k', 'l']) {
    await page.keyboard.down(k);
    await page.waitForTimeout(60);
    await page.keyboard.up(k);
  }
  await expect(page.getByTestId('hud-note')).not.toHaveText('—');

  // , e . mudam de instrumento
  const before = await page.evaluate(
    () => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().instrument,
  );
  await page.keyboard.press('.');
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().instrument),
    )
    .not.toBe(before);
  await page.keyboard.press(',');

  // tocar com o rato (menu ⋯): teclado de piano e pads
  await page.getByTestId('more').click();
  await page.getByTestId('menu-rato').click();
  const key = drawer.locator('[data-testid^="key-"]').nth(5);
  await key.hover();
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'drums' }),
  );
  await drawer.getByTestId('pad-1').click();
  await expect(page.getByTestId('hud-note')).toHaveText('Tarola');
  await page.keyboard.press('Escape');

  // pipeline real de gestos com mãos sintéticas: dobrar o médio esquerdo dispara uma nota
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'marimba' }),
  );
  const note = await playSynthetic(page);
  expect(note).toMatch(/^(Dó|Ré|Mi|Fá|Sol|Lá|Si)♯?\d$/);

  // gravar 2 s pela barra; a gravação aparece na gaveta
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(2000);
  await page.getByTestId('record').click();
  await page.getByTestId('chip-recordings').click();
  await expect(page.getByTestId('recording-item')).toHaveCount(1, { timeout: 10_000 });
  await page.keyboard.press('Escape');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('fundo do palco: começa em só mãos, a câmara fica no menu', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await startCamera(page);
  await expect(page.getByTestId('stage-bg')).toContainText('Só mãos');
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '0');
  // a pessoa não se vê, mas a deteção continua
  expect(await playSynthetic(page)).toMatch(/\d$/);
  await page.getByTestId('stage-bg').click();
  await expect(page.getByTestId('stage-bg')).toContainText('Ondas');
  await expect(page.getByTestId('stage-waves')).toBeVisible();
  await page.getByTestId('stage-bg').click();
  await expect(page.getByTestId('stage-bg')).toContainText('Só mãos');
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '0');
  // a câmara só se escolhe no menu ⋯
  await page.getByTestId('more').click();
  await page.getByTestId('menu-bg-camara').click();
  await expect(page.getByTestId('stage-bg')).toContainText('Câmara');
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '1');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('esconder interface com I e voltar com Esc', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('i');
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '0');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '1');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('uma gaveta de cada vez', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('chip-scale').click();
  // só a gaveta está aberta (o ecrã inicial também tem role=dialog, por isso conta-se dialog[open])
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await expect(page.getByTestId('scale-panel')).toBeVisible();
  // clicar fora fecha
  await page.mouse.click(10, 300);
  await expect(page.getByTestId('drawer')).toBeHidden();
  await expect(page.getByTestId('scale-panel')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sem Fullscreen API (iPhone), o botão esconde a interface', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }),
  );
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '0');
  // escondida, a barra sai da ordem do Tab
  await expect(page.getByTestId('bar-slot')).toHaveCSS('visibility', 'hidden');
  // no toque não há teclado: a barra espreita e o ⋯ volta a mostrar a interface
  await page.mouse.move(200, 200);
  await page.mouse.move(220, 220);
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '1');
  await page.getByTestId('more').click();
  await expect(page.getByTestId('menu-hide')).toContainText('Mostrar interface');
  await page.getByTestId('menu-hide').click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().uiHidden),
    )
    .toBe(false);
  await expect(page.getByTestId('bar-slot')).toHaveCSS('opacity', '1');
  await expect(page.locator('header').first()).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('com uma gaveta aberta, I e E não mexem na interface', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('chip-scale').click();
  const drawer = page.getByTestId('drawer');
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: /^Fechar/ }).focus();
  await page.keyboard.press('i');
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => ({
      uiHidden: (window as unknown as { __vsc: Vsc }).__vsc.store.getState().uiHidden,
      fullscreen: !!document.fullscreenElement,
    })),
  ).toEqual({ uiHidden: false, fullscreen: false });
  await expect(drawer).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('câmara em retrato no desktop: a barra não passa do palco', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?debug');
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store
      .getState()
      .set({ videoSize: { w: 720, h: 1280 } }),
  );
  const stage = (await page.getByTestId('stage').boundingBox())!;
  // os chips que não cabem deslizam dentro da barra: o ⋯ chega-se sem sair do palco
  const more = page.getByTestId('more');
  await more.scrollIntoViewIfNeeded();
  const box = (await more.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(stage.x);
  expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
  await more.click();
  await expect(page.getByTestId('menu-efeitos')).toBeInViewport({ ratio: 1 });
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const showVideo of [false, true]) {
  test(`preferências da v1 (showVideo: ${showVideo}) abrem em só mãos`, async ({ page }) => {
    await page.addInitScript((showVideo) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'vision-sound-cam:prefs',
        JSON.stringify({ state: { showVideo, instrument: 'marimba' }, version: 1 }),
      );
    }, showVideo);
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await expect(page.getByTestId('stage-bg')).toContainText('Só mãos');
    await expect(page.getByTestId('chip-instrument')).toContainText('Marimba');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test(`menu ⋯ ${vp.width}×${vp.height}: cabe no ecrã e abre as gavetas`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    await page.getByTestId('more').click();
    const menu = page.getByRole('menu', { name: 'Mais opções' });
    const box = (await menu.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    // o foco entra no primeiro item e as setas percorrem o menu
    await expect(page.getByTestId('menu-instrumentos')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menu-escala')).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('menu-hide')).toBeFocused();
    // todos os itens se alcançam (o menu desliza se não couber)
    for (const id of ['menu-efeitos', 'menu-rato', 'menu-bg-camara', 'menu-hide']) {
      const item = page.getByTestId(id);
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport({ ratio: 1 });
    }
    // Esc fecha o menu e devolve o foco ao ⋯
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByTestId('more')).toBeFocused();
    // uma gaveta aberta pelo menu devolve o foco ao ⋯ ao fechar
    await page.getByTestId('more').click();
    await page.getByTestId('menu-efeitos').click();
    const drawer = page.getByTestId('drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('effects')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(page.getByTestId('more')).toBeFocused();
    // o menu também escolhe o fundo e esconde a interface
    await page.getByTestId('more').click();
    await page.getByTestId('menu-bg-camara').click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().stageBg),
      )
      .toBe('camara');
    await page.getByTestId('more').click();
    await page.getByTestId('menu-hide').click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().uiHidden),
      )
      .toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test(`layout ${vp.width}×${vp.height}: sem scroll horizontal, palco e barra à vista`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('stage')).toBeInViewport();
    await expect(page.getByTestId('control-bar')).toBeInViewport();
    await expect(page.getByTestId('chip-instrument')).toBeInViewport();
    await expect(page.getByTestId('more')).toBeInViewport();
    // alvos de toque abaixo de 1100px: pelo menos 40×40
    if (vp.width < 1100) {
      const rec = (await page.getByTestId('chip-recordings').boundingBox())!;
      expect(Math.min(rec.width, rec.height)).toBeGreaterThanOrEqual(40);
    }
    // com o fundo por defeito (só mãos), a faixa de ondas aparece por baixo do palco no desktop
    if (vp.width === 1440) await expect(page.getByTestId('waves')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

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
