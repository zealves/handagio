import { expect, test, type Page } from '@playwright/test';

// Mensagens que não são erros: o WASM do MediaPipe escreve INFO em console.error.
const IGNORED = [/INFO: Created TensorFlow Lite XNNPACK delegate/];

function watchConsole(page: Page, opts: { allowFailedSamples?: boolean } = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error' || IGNORED.some((r) => r.test(m.text()))) return;
    // o Chromium regista sempre os pedidos abortados; só se aceitam os das amostras
    if (
      opts.allowFailedSamples &&
      m.text().startsWith('Failed to load resource') &&
      m.location().url.includes('/samples/')
    )
      return;
    errors.push(m.text());
  });
  return errors;
}

type Vsc = {
  session: {
    feedHands(
      h: unknown[],
      handedness?: ({ label: 'Left' | 'Right'; score: number } | null)[],
    ): void;
    ensureAudio(): void;
  };
  audio: {
    voiceMidi(key: number | string): number | null;
    noteOn(key: string, id: string, midi: number, vel: number, pan: number): void;
    noteOff(key: string): void;
    analyser: { frequency(): Uint8Array; level(): number };
  };
  syntheticHand(closed: boolean[] | boolean, x?: number, y?: number): unknown;
  live: { videoW: number; videoH: number };
  store: {
    getState(): {
      instrument: string;
      lastNote: string;
      engine: string;
      uiHidden: boolean;
      sampleStatus: Record<string, string>;
      customNotes: number[];
      set(p: Record<string, unknown>): void;
    };
  };
};

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

/**
 * Dobra um dedo com mãos sintéticas (mão 0 = esquerda, 1 = direita; dedo 0 = polegar …
 * 4 = mindinho), depois de limpar a última nota, e devolve a nota que tocou.
 */
function playFinger(page: Page, hand: number, finger: number) {
  return page.evaluate(
    async ({ hand, finger }) => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      v.store.getState().set({ lastNote: '—' });
      const bentOf = (h: number) => {
        const c = [false, false, false, false, false];
        if (h === hand) c[finger] = true;
        return c;
      };
      const open = [v.syntheticHand(false, 0.3), v.syntheticHand(false, 0.7)];
      const bent = [v.syntheticHand(bentOf(0), 0.3), v.syntheticHand(bentOf(1), 0.7)];
      const wait = () => new Promise((r) => setTimeout(r, 33));
      for (const hands of [open, open, open, open, bent, bent, bent, bent]) {
        v.session.feedHands(hands);
        await wait();
      }
      for (let k = 0; k < 4; k++) {
        v.session.feedHands(open);
        await wait();
      }
      return v.store.getState().lastNote;
    },
    { hand, finger },
  );
}

/** Fixa a configuração das notas que um teste usa, para não depender dos valores por defeito. */
function pinNotes(page: Page, p: Record<string, unknown>) {
  return page.evaluate(
    (p) => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set(p),
    p,
  );
}

/** Notas personalizadas por defeito antes da v5 (Dó Pentatónica, com polegares). */
const LEGACY_CUSTOM_NOTES = [57, 55, 52, 50, 48, 60, 62, 64, 67, 69];

/** Liga o áudio e abre a gaveta da escala. */
async function openScale(page: Page) {
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await page.getByTestId('chip-scale').click();
  await expect(page.getByTestId('scale-panel')).toBeVisible();
}

/** Texto das notas de cada dedo no painel, pela ordem do ecrã. */
const fingerNotes = (page: Page) => page.locator('[data-testid^="finger-note-"]').allTextContents();

/** Estado das amostras de um instrumento (undefined enquanto nunca foi pedido). */
function sampleStatus(page: Page, id: string) {
  return page.evaluate(
    (id) => (window as unknown as { __vsc: Vsc }).__vsc.store.getState().sampleStatus[id],
    id,
  );
}

/** Toca uma nota durante `holdMs` e devolve o RMS máximo à saída nos primeiros 300 ms. */
function playRms(page: Page, id: string, midi = 69, holdMs = 200) {
  return page.evaluate(
    async ({ id, midi, holdMs }) => {
      const { audio } = (window as unknown as { __vsc: Vsc }).__vsc;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const t0 = performance.now();
      audio.noteOn('e2e', id, midi, 0.8, 0);
      let rms = 0;
      let off = false;
      while (performance.now() - t0 < 300) {
        rms = Math.max(rms, audio.analyser.level());
        if (!off && performance.now() - t0 >= holdMs) {
          audio.noteOff('e2e');
          off = true;
        }
        await sleep(5);
      }
      if (!off) audio.noteOff('e2e');
      return rms;
    },
    { id, midi, holdMs },
  );
}

/** Espera o silêncio, toca `midi` (toque de 200 ms) e lê o espectro aos 300 ms (bins 0–255). */
function spectrumAt300(page: Page, id: string, midi: number) {
  return page.evaluate(
    async ({ id, midi }) => {
      const { audio } = (window as unknown as { __vsc: Vsc }).__vsc;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let k = 0; k < 80 && audio.analyser.level() > 5e-4; k++) await sleep(50);
      await sleep(300);
      // o suavizado do AnalyserNode mistura cada leitura com a anterior: lê-se durante a nota
      // toda, como os visualizadores, para o espectro não trazer o instrumento anterior
      const t0 = performance.now();
      audio.noteOn('e2e', id, midi, 0.8, 0);
      let off = false;
      while (performance.now() - t0 < 300) {
        audio.analyser.frequency();
        if (!off && performance.now() - t0 >= 200) {
          audio.noteOff('e2e');
          off = true;
        }
        await sleep(8);
      }
      return Array.from(audio.analyser.frequency().slice(0, 256));
    },
    { id, midi },
  );
}

function cosine(a: number[], b: number[]) {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return d / Math.sqrt(na * nb);
}

/** Liga o áudio (como faria o primeiro gesto) e abre a gaveta pelo menu ⋯ → Instrumentos. */
async function openInstruments(page: Page) {
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await page.getByTestId('more').click();
  await page.getByTestId('menu-instrumentos').click();
  await expect(page.getByTestId('drawer')).toBeVisible();
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
  // o palco mostra só as mãos: o vídeo continua a reproduzir para a deteção, mas invisível
  await expect(page.getByTestId('video')).toHaveCSS('opacity', '0');

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
  // a faixa de ondas por baixo do palco desenha: há píxeis opacos na coluna do meio
  await expect
    .poll(() =>
      page.evaluate(() => {
        const cv = document.querySelector<HTMLCanvasElement>('[data-testid="waves"]');
        const g = cv?.getContext('2d');
        if (!cv || !g || !cv.width || !cv.height) return 0;
        const col = g.getImageData(Math.floor(cv.width / 2), 0, 1, cv.height).data;
        let n = 0;
        for (let i = 3; i < col.length; i += 4) if (col[i] > 0) n++;
        return n;
      }),
    )
    .toBeGreaterThan(0);

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

test('deteção leve: câmara a 640×360, overlay a 1280 e a face só com o efeito da boca', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('start').click();
  type Dbg = {
    __vsc: {
      session: { stats: { handDetects: number; faceDetects: number } };
      store: { getState(): { faceState: string; engine: string; set(p: unknown): void } };
    };
  };
  const state = () =>
    page.evaluate(() => {
      const v = (window as unknown as Dbg).__vsc;
      const st = v.store.getState();
      return { ...v.session.stats, faceState: st.faceState, engine: st.engine };
    });
  await expect.poll(async () => (await state()).faceState, { timeout: 30_000 }).toBe('ok');
  await expect.poll(async () => (await state()).engine, { timeout: 30_000 }).toBe('hands');
  // a câmara pede 640×360; o overlay continua a desenhar a 1280 de largura
  expect(
    await page.evaluate(() => {
      const v = document.querySelector('video')!;
      return `${v.videoWidth}x${v.videoHeight}`;
    }),
  ).toBe('640x360');
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector('[data-testid="overlay"]') as HTMLCanvasElement).width,
      ),
    )
    .toBe(1280);

  // com o efeito da boca em "Nenhum", o detetor da face não é chamado; o das mãos continua
  await page.evaluate(() =>
    (window as unknown as Dbg).__vsc.store.getState().set({ mouthFx: 'off' }),
  );
  await page.waitForTimeout(200);
  const a = await state();
  await page.waitForTimeout(1500);
  const b = await state();
  expect(b.faceDetects).toBe(a.faceDetects);
  expect(b.handDetects).toBeGreaterThan(a.handDetects + 10);

  // com um efeito da boca, a face volta a correr (menos vezes do que as mãos)
  await page.evaluate(() =>
    (window as unknown as Dbg).__vsc.store.getState().set({ mouthFx: 'wah' }),
  );
  await page.waitForTimeout(1500);
  const c = await state();
  expect(c.faceDetects).toBeGreaterThan(b.faceDetects + 5);
  expect(c.faceDetects - b.faceDetects).toBeLessThan(c.handDetects - b.handDetects);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('aprender a mão: toggle nas Definições e Repor calibração esquece o aprendido', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  type Dbg = {
    __vsc: {
      store: {
        getState(): {
          learnHand: boolean;
          learnedRanges: unknown;
          set(p: Record<string, unknown>): void;
        };
      };
    };
  };
  const learned = [null, { lo: 0.1, hi: 0.7 }, null, { lo: 0.05, hi: 0.5 }];
  await page.evaluate(
    (l) =>
      (window as unknown as Dbg).__vsc.store
        .getState()
        .set({ learnedRanges: l, settingsOpen: true }),
    learned,
  );
  const settings = page.getByTestId('settings');
  await expect(settings).toBeVisible();
  const toggle = settings.getByTestId('learn-hand');
  await expect(toggle).toBeChecked();
  await expect(settings.getByTestId('learned-bars').locator('span[role="img"]')).toHaveCount(8);
  // com os polegares, os 10 dedos (os polegares também aprendem)
  await page.evaluate(() =>
    (window as unknown as Dbg).__vsc.store.getState().set({ thumbs: true }),
  );
  await expect(settings.getByTestId('learned-bars').locator('span[role="img"]')).toHaveCount(10);
  await page.evaluate(() =>
    (window as unknown as Dbg).__vsc.store.getState().set({ thumbs: false }),
  );
  await settings.getByTestId('reset-calibration').click();
  expect(
    await page.evaluate(() => (window as unknown as Dbg).__vsc.store.getState().learnedRanges),
  ).toBeNull();
  await expect(settings.getByTestId('learned-bars')).toHaveCount(0);
  await expect(settings.getByTestId('reset-calibration')).toBeDisabled();
  await toggle.click({ force: true });
  expect(
    await page.evaluate(() => (window as unknown as Dbg).__vsc.store.getState().learnHand),
  ).toBe(false);
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

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Liga o palco sem câmara (o ecrã inicial sai e o HUD aparece). */
function markStarted(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ started: true }),
  );
}

test('forma de tocar: coluna à esquerda do palco, dica, tecla C e menu ⋯', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  const chord = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { __vsc: { store: { getState(): { chord: string } } } }
        ).__vsc.store.getState().chord,
    );
  const checked = (id: string) =>
    expect(page.getByTestId(`chord-${id}`)).toHaveAttribute('aria-checked', 'true');
  const column = page.getByRole('radiogroup', { name: 'Cada dedo toca' });
  await expect(column).toBeVisible();
  await expect(column).toContainText('Cada dedo toca…');
  // as 7 opções estão à vista, com os rótulos, da mais simples à mais rica
  await expect(column.getByRole('radio')).toHaveText([
    'Uma nota',
    'Oitava',
    'Quinta',
    'Acorde',
    'Suspenso',
    'Sétima',
    'Nona',
  ]);
  await expect(column).toBeInViewport({ ratio: 1 });
  // à esquerda do palco, sem tapar a barra nem os chips do HUD
  const stage = (await page.getByTestId('stage').boundingBox())!;
  const col = (await column.boundingBox())!;
  expect(col.x).toBeGreaterThanOrEqual(stage.x);
  expect(col.x).toBeLessThan(stage.x + stage.width * 0.2);
  expect(overlaps(col, (await page.getByTestId('control-bar').boundingBox())!)).toBe(false);
  for (const chip of await page.getByTestId('hud').locator('span').all())
    expect(overlaps(col, (await chip.boundingBox())!)).toBe(false);
  // alvos de toque com pelo menos 36 px de altura
  expect((await page.getByTestId('chord-power').boundingBox())!.height).toBeGreaterThanOrEqual(36);
  await checked('off');
  await page.getByTestId('chord-power').click();
  await checked('power');
  expect(await chord()).toBe('power');
  // a explicação aparece numa dica ao passar o rato
  await page.getByTestId('chord-seventh').hover();
  const tip = page.getByRole('tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('4 notas');
  await expect(page.getByTestId('chord-seventh')).toHaveAccessibleDescription(/4 notas/);
  await page.mouse.move(700, 300);
  await expect(tip).toHaveCount(0);
  // teclado: a opção escolhida é a única no Tab; as setas mudam de opção
  await page.getByTestId('chord-power').blur();
  await page.keyboard.press('Shift'); // o foco que se segue conta como de teclado
  await page.getByTestId('chord-power').focus();
  await expect(tip).toContainText('power chord');
  await page.keyboard.press('ArrowDown');
  await checked('triad');
  await expect(page.getByTestId('chord-triad')).toBeFocused();
  await expect(page.getByTestId('chord-power')).toHaveAttribute('tabindex', '-1');
  // C passa ao seguinte, pela mesma ordem, e volta ao início
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  for (const id of ['sus4', 'seventh', 'ninth', 'off', 'octave']) {
    await page.keyboard.press('c');
    await checked(id);
  }
  // e no menu ⋯, com o mesmo título
  await page.getByTestId('more').click();
  await expect(page.getByRole('group', { name: 'Cada dedo toca' })).toBeVisible();
  await page.getByTestId('menu-chord-power').click();
  await checked('power');
  expect(await chord()).toBe('power');
  // a coluna esconde-se com a interface
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('i');
  await expect(page.getByTestId('chord-slot')).toHaveCSS('visibility', 'hidden');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('forma de tocar no telemóvel: sem coluna, no menu ⋯', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?debug');
  await markStarted(page);
  await expect(page.getByTestId('chord-column')).toBeHidden();
  await page.getByTestId('more').click();
  for (const id of ['off', 'octave', 'power', 'triad', 'sus4', 'seventh', 'ninth']) {
    await page.getByTestId(`menu-chord-${id}`).scrollIntoViewIfNeeded();
    await expect(page.getByTestId(`menu-chord-${id}`)).toBeInViewport({ ratio: 1 });
  }
  await page.getByTestId('menu-chord-triad').click();
  await expect(page.getByTestId('chord-triad')).toHaveAttribute('aria-checked', 'true');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('forma de tocar em paisagem baixa: coluna compacta, dentro do ecrã', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/?debug');
  await markStarted(page);
  const column = page.getByTestId('chord-column');
  await expect(column).toBeVisible();
  await expect(column).toBeInViewport({ ratio: 1 });
  const col = (await column.boundingBox())!;
  expect(overlaps(col, (await page.getByTestId('control-bar').boundingBox())!)).toBe(false);
  for (const chip of await page.getByTestId('hud').locator('span').all())
    expect(overlaps(col, (await chip.boundingBox())!)).toBe(false);
  // os chips do HUD da direita ficam à esquerda da barra vertical
  const bar = (await page.getByTestId('control-bar').boundingBox())!;
  for (const chip of await page.getByTestId('hud').locator('span').all())
    expect(overlaps(bar, (await chip.boundingBox())!)).toBe(false);
  // só os desenhos, em duas colunas: o rótulo passa para a dica
  await expect(column.getByRole('radio')).toHaveCount(7);
  for (const r of await column.getByRole('radio').all())
    await expect(r).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('chord-power').getByText('Quinta')).toBeHidden();
  await page.getByTestId('chord-power').hover();
  await expect(page.getByRole('tooltip')).toContainText('Quinta');
  await page.getByTestId('chord-power').click();
  await expect(page.getByTestId('chord-power')).toHaveAttribute('aria-checked', 'true');
  // na grelha de 2 colunas, ←/→ também mudam de opção (pela ordem de leitura); Home e End vão aos extremos
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('chord-triad')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('chord-triad')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('chord-power')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await expect(page.getByTestId('chord-ninth')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('chord-ninth')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('chord-off')).toHaveAttribute('aria-checked', 'true');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('forma de tocar a 1024×768: os 7 modos cabem sem tapar o HUD nem a barra', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?debug');
  await markStarted(page);
  const column = page.getByTestId('chord-column');
  await expect(column).toBeInViewport({ ratio: 1 });
  await expect(column.getByRole('radio')).toHaveCount(7);
  const col = (await column.boundingBox())!;
  const stage = (await page.getByTestId('stage').boundingBox())!;
  expect(col.y).toBeGreaterThanOrEqual(stage.y);
  expect(col.y + col.height).toBeLessThanOrEqual(stage.y + stage.height);
  expect(overlaps(col, (await page.getByTestId('control-bar').boundingBox())!)).toBe(false);
  for (const chip of await page.getByTestId('hud').locator('span').all())
    expect(overlaps(col, (await chip.boundingBox())!)).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

type VoicesVsc = Vsc & { audio: { activeVoices: number } };

test('Uma nota com quantização: um toque mais curto do que um passo ainda soa', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await pinNotes(page, {
    started: true,
    instrument: 'synth',
    chord: 'off',
    bpm: 60,
    quantize: '1/16',
    noteMode: 'scale',
  });
  const r = await page.evaluate(async () => {
    const v = (window as unknown as { __vsc: VoicesVsc }).__vsc;
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
    await sleep(300);
    // tecla S (um dedo) premida ~30 ms: a 60 BPM uma semicolcheia dura 250 ms
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    const voices = v.audio.activeVoices;
    await sleep(30);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 's' }));
    let level = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 700) {
      level = Math.max(level, v.audio.analyser.level());
      await sleep(5);
    }
    return { voices, level, after: v.audio.activeVoices };
  });
  // a nota, agendada para o passo seguinte, não é cortada ao soltar (PENDING_HOLD, decisão 57)
  expect(r.voices).toBe(1);
  expect(r.level).toBeGreaterThan(0.01);
  expect(r.after).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Nona: um dedo toca 5 vozes', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await pinNotes(page, { started: true, instrument: 'synth', chord: 'ninth', noteMode: 'scale' });
  await expect(page.getByTestId('chord-ninth')).toHaveAttribute('aria-checked', 'true');
  const r = await page.evaluate(async () => {
    const v = (window as unknown as { __vsc: VoicesVsc }).__vsc;
    const wait = () => new Promise((res) => setTimeout(res, 33));
    const open = [v.syntheticHand(false, 0.3), v.syntheticHand(false, 0.7)];
    const bent = [
      v.syntheticHand([false, false, true, false, false], 0.3),
      v.syntheticHand(false, 0.7),
    ];
    for (const hands of [open, open, open, open, bent, bent, bent, bent]) {
      v.session.feedHands(hands);
      await wait();
    }
    const held = v.audio.activeVoices;
    const note = v.store.getState().lastNote;
    for (let k = 0; k < 4; k++) {
      v.session.feedHands(open);
      await wait();
    }
    return { held, note, after: v.audio.activeVoices };
  });
  expect(r.held).toBe(5);
  expect(r.note).toMatch(/9/);
  expect(r.after).toBe(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('ecrã tátil', () => {
  test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });
  test('forma de tocar: a explicação aparece por um instante ao escolher', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await markStarted(page);
    await page.getByTestId('chord-seventh').tap();
    await expect(page.getByTestId('chord-seventh')).toHaveAttribute('aria-checked', 'true');
    const tip = page.getByRole('tooltip');
    await expect(tip).toContainText('4 notas');
    await expect(tip).toHaveCount(0, { timeout: 4000 });
    expect(errors, errors.join('\n')).toEqual([]);
  });
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

test('câmara em retrato no desktop: o palco continua panorâmico e a barra não passa dele', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?debug');
  await page.evaluate(() => {
    const live = (window as unknown as { __vsc: Vsc }).__vsc.live;
    live.videoW = 720;
    live.videoH = 1280;
  });
  await expect
    .poll(() => page.getByTestId('overlay').evaluate((c: HTMLCanvasElement) => c.height))
    .toBe(1280);
  const stage = (await page.getByTestId('stage').boundingBox())!;
  expect(stage.width).toBeGreaterThan(stage.height);
  expect(stage.width).toBeGreaterThanOrEqual(1024 * 0.9);
  // o overlay em retrato enche o palco sem deformar
  await expect(page.getByTestId('overlay')).toHaveCSS('object-fit', 'cover');
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
  test(`preferências da v1 (showVideo: ${showVideo}) abrem só com as mãos`, async ({ page }) => {
    await page.addInitScript((showVideo) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem(
        'handagio:prefs',
        JSON.stringify({ state: { showVideo, instrument: 'marimba' }, version: 1 }),
      );
    }, showVideo);
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await expect(page.getByTestId('video')).toHaveCSS('opacity', '0');
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
    for (const id of ['menu-efeitos', 'menu-rato', 'menu-hide']) {
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
    // o menu também esconde a interface
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
    // a faixa de ondas está sempre por baixo do palco, dentro do ecrã
    const waves = page.getByTestId('waves');
    await expect(waves).toBeVisible();
    await expect(waves).toBeInViewport({ ratio: 1 });
    const stageBox = (await page.getByTestId('stage').boundingBox())!;
    const wavesBox = (await waves.boundingBox())!;
    expect(wavesBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 0.5);
    // o rodapé dos efeitos só aparece com espaço (≥ 600 px de largura e de altura), entre o
    // palco e a faixa, e nunca sai do ecrã
    const footer = page.getByTestId('effects-footer');
    if (vp.width >= 600 && vp.height >= 600) {
      await expect(footer).toBeInViewport({ ratio: 1 });
      const f = (await footer.boundingBox())!;
      expect(f.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height);
      expect(f.y + f.height).toBeLessThanOrEqual(wavesBox.y);
    } else await expect(footer).toBeHidden();
    // a barra já não tem os mini-knobs nem o chip Efeitos
    await expect(page.getByTestId('chip-effects')).toHaveCount(0);
    await expect(page.getByTestId('quick-reverb')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

// O palco ocupa todo o espaço livre (o vídeo não se vê): panorâmico em paisagem, também no
// tablet, com margens mínimas.
for (const vp of [
  { width: 1024, height: 768, minW: 0.9, wide: true },
  { width: 1180, height: 820, minW: 0.9, wide: true },
  { width: 1440, height: 900, minW: 0.9, wide: true },
  { width: 820, height: 1180, minW: 0.95, wide: false },
]) {
  test(`palco ${vp.width}×${vp.height}: ocupa ≥ ${vp.minW * 100}% da largura`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    const stage = (await page.getByTestId('stage').boundingBox())!;
    expect(stage.width).toBeGreaterThanOrEqual(vp.width * vp.minW);
    if (vp.wide) expect(stage.width).toBeGreaterThan(stage.height);
    // a câmara falsa entrega 16:9 mas o palco não segue a proporção dela
    expect(stage.height).toBeGreaterThanOrEqual(vp.height * 0.6);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // o overlay das mãos enche o palco
    const overlay = (await page.getByTestId('overlay').boundingBox())!;
    expect(overlay.width).toBeCloseTo(stage.width, 0);
    expect(overlay.height).toBeCloseTo(stage.height, 0);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('marca: Handagio no título e no cabeçalho, com Vision Sound Cam como descritivo', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await expect(page).toHaveTitle(/Handagio/);
  const brand = page.getByRole('banner').getByRole('heading', { level: 1 });
  await expect(brand).toContainText('Handagio');
  await expect(brand).toContainText('Vision Sound Cam');
  // as preferências ficam guardadas com a chave nova
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'marimba' }),
  );
  expect(await page.evaluate(() => localStorage.getItem('handagio:prefs'))).toContain('marimba');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rodapé dos efeitos: os 5 knobs com o nome e o efeito da boca', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?debug');
  await markStarted(page);
  const footer = page.getByTestId('effects-footer');
  await expect(footer).toBeVisible();
  await expect(footer).toHaveAccessibleName('Efeitos');
  const names = { reverb: 'Reverb', echo: 'Eco', filter: 'Filtro', drive: 'Drive', pitch: 'Pitch' };
  for (const [id, name] of Object.entries(names)) {
    const knob = page.getByTestId(`footer-${id}`);
    await expect(knob).toBeInViewport({ ratio: 1 });
    await expect(knob).toHaveAccessibleName(name);
    // o nome vê-se por baixo do knob
    await expect(knob.locator('..').getByText(name, { exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('footer-mouth')).toBeVisible();
  await expect(page.getByTestId('footer-mouth')).toHaveAccessibleName('Efeito da boca');
  // o knob mexe-se com o teclado e muda o valor no store
  const reverb = () =>
    page.evaluate(
      () =>
        (
          window as unknown as { __vsc: { store: { getState(): { reverb: number } } } }
        ).__vsc.store.getState().reverb,
    );
  const before = await reverb();
  await page.getByTestId('footer-reverb').focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(reverb).toBeCloseTo(before + 0.01, 5);
  // com o foco, o valor aparece no lugar do nome
  const cell = page.getByTestId('footer-reverb').locator('..');
  await expect(cell.getByText(`${Math.round((before + 0.01) * 100)}%`)).toBeVisible();
  await expect(cell.getByText('Reverb', { exact: true })).toBeHidden();
  // o seletor da boca muda o efeito
  await page.getByTestId('footer-mouth').selectOption('vibrato');
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __vsc: { store: { getState(): { mouthFx: string } } } }
        ).__vsc.store.getState().mouthFx,
    ),
  ).toBe('vibrato');
  // esconde-se com a interface
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('i');
  await expect(footer).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`rodapé dos efeitos ${vp.width}×${vp.height}: escondido, os efeitos no menu ⋯`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    await markStarted(page);
    await expect(page.getByTestId('effects-footer')).toBeHidden();
    await page.getByTestId('more').click();
    await page.getByTestId('menu-efeitos').click();
    const drawer = page.getByTestId('drawer');
    await expect(drawer.getByTestId('effects')).toBeVisible();
    await expect(drawer.getByTestId('knob-reverb')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

for (const vp of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`coluna ${vp.width}×${vp.height}: o título quebra em vez de ser cortado`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    await markStarted(page);
    const title = page.getByTestId('chord-column').getByText('Cada dedo toca…');
    await expect(title).toBeVisible();
    const m = await title.evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
      ellipsis: getComputedStyle(el).textOverflow,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.ellipsis).not.toBe('ellipsis');
    // com o rodapé, os rótulos continuam à vista
    await expect(page.getByTestId('chord-power').getByText('Quinta')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test.describe('instrumentos gravados', () => {
  // o page.route não vê pedidos feitos pelo service worker
  test.use({ serviceWorkers: 'block' });

  test('instrumento gravado carrega e toca', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await openInstruments(page);
    const sample = page.waitForResponse(
      (r) => /\/samples\/violin\/[^/]+\.mp3$/.test(r.url()) && r.status() === 200,
    );
    await page.getByTestId('tile-violin').click();
    await sample;
    await expect.poll(() => sampleStatus(page, 'violin'), { timeout: 15_000 }).toBe('ready');
    await expect(page.getByTestId('tile-violin')).toContainText('gravado');
    await expect(page.getByTestId('chip-instrument')).toHaveAttribute(
      'aria-label',
      'Instrumento: Violino',
    );
    expect(await playRms(page, 'violin')).toBeGreaterThan(0.01);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('violino e flauta não soam iguais', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await openInstruments(page);
    // cada escolha só carrega ~300 ms depois (percorrer a lista não descarrega tudo): espera
    // que o violino fique pronto antes de escolher a flauta
    for (const id of ['violin', 'flute']) {
      await page.getByTestId(`tile-${id}`).click();
      await expect.poll(() => sampleStatus(page, id), { timeout: 15_000 }).toBe('ready');
    }
    await page.keyboard.press('Escape');
    // compara o timbre: sem reverberação nem eco, que espalham o espectro de qualquer som
    await page.evaluate(() =>
      (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ reverb: 0, echo: 0 }),
    );
    // o mesmo tom (Lá4) e a mesma força nos dois
    const violin = await spectrumAt300(page, 'violin', 69);
    const flute = await spectrumAt300(page, 'flute', 69);
    expect(Math.max(...violin)).toBeGreaterThan(0);
    expect(Math.max(...flute)).toBeGreaterThan(0);
    expect(cosine(violin, flute)).toBeLessThan(0.9);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('percorrer instrumentos só carrega aquele onde se para', async ({ page }) => {
    const errors = watchConsole(page);
    const requested: string[] = [];
    page.on('request', (r) => {
      const m = /\/samples\/([^/]+)\/[^/]+\.mp3$/.exec(r.url());
      if (m) requested.push(m[1]);
    });
    await page.goto('/?debug');
    await openInstruments(page);
    await page.getByTestId('tile-violin').click();
    await page.getByTestId('tile-cello').click();
    await page.getByTestId('tile-flute').click();
    await expect.poll(() => sampleStatus(page, 'flute'), { timeout: 15_000 }).toBe('ready');
    expect(new Set(requested.filter((id) => id !== 'piano'))).toEqual(new Set(['flute']));
    expect(await sampleStatus(page, 'violin')).toBeUndefined();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('tocar enquanto carrega usa a reserva', async ({ page }) => {
    const errors = watchConsole(page);
    await page.route('**/samples/cello/**', async (r) => {
      await new Promise((res) => setTimeout(res, 3000));
      await r.continue().catch(() => {});
    });
    await page.goto('/?debug');
    await openInstruments(page);
    await page.getByTestId('tile-cello').click();
    await expect(page.getByTestId('tile-cello')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('chip-instrument')).toHaveAttribute(
      'aria-label',
      'Instrumento: Violoncelo (a carregar)',
    );
    // ainda sem amostras: soa o patch de reserva
    expect(await sampleStatus(page, 'cello')).toBe('loading');
    expect(await playRms(page, 'cello', 57)).toBeGreaterThan(0.01);
    // e quando chegam, passa às amostras sem erros
    await expect.poll(() => sampleStatus(page, 'cello'), { timeout: 15_000 }).toBe('ready');
    await expect(page.getByTestId('tile-cello')).not.toHaveAttribute('aria-busy', 'true');
    expect(await playRms(page, 'cello', 57)).toBeGreaterThan(0.01);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('sem rede na primeira escolha', async ({ page }) => {
    const errors = watchConsole(page, { allowFailedSamples: true });
    await page.route('**/samples/tuba/**', (r) => r.abort());
    await page.goto('/?debug');
    await openInstruments(page);
    await page.getByTestId('tile-tuba').click();
    await expect.poll(() => sampleStatus(page, 'tuba'), { timeout: 15_000 }).toBe('error');
    await expect(page.getByTestId('tile-tuba')).toContainText(
      'Não foi possível carregar — toca para tentar de novo',
    );
    await expect(page.getByTestId('chip-instrument')).toHaveAttribute(
      'aria-label',
      'Instrumento: Tuba (erro ao carregar)',
    );
    // o som continua a sair da reserva
    expect(await playRms(page, 'tuba', 45)).toBeGreaterThan(0.01);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('sem internet', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a cache passa a handagio-* e a ativação apaga as vsc-* do nome antigo', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    // caches que a versão antiga deixou (e uma de outra app, que fica)
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      void caches.open('vsc-2.0.0');
      void caches.open('outra-app');
    });
    await page.goto('/?debug');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual(expect.arrayContaining(['outra-app', expect.stringMatching(/^handagio-/)]));
    const keys = await page.evaluate(() => caches.keys());
    expect(keys.filter((k) => k.startsWith('vsc-'))).toEqual([]);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('funciona offline depois do primeiro carregamento', async ({ page, context }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
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
    // o instrumento por defeito (piano) vem do pré-cache: toca com amostras sem rede
    await expect.poll(() => sampleStatus(page, 'piano'), { timeout: 15_000 }).toBe('ready');
    expect(await playRms(page, 'piano')).toBeGreaterThan(0.01);

    // depois de usado com rede, um instrumento gravado também funciona sem internet
    await context.setOffline(false);
    await openInstruments(page);
    await page.getByTestId('tile-violin').click();
    await expect.poll(() => sampleStatus(page, 'violin'), { timeout: 15_000 }).toBe('ready');
    // o service worker guarda as respostas em segundo plano: espera que estejam todas na cache
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const urls = performance
            .getEntriesByType('resource')
            .map((e) => e.name)
            .filter((u) => u.includes('/samples/violin/'));
          const hits = await Promise.all(urls.map((u) => caches.match(u)));
          return urls.length > 0 && hits.every(Boolean);
        }),
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('start').click();
    await expect(page.getByRole('status').filter({ hasText: /Pronto|Mostra/ })).toBeVisible({
      timeout: 30_000,
    });
    await openInstruments(page);
    await page.getByTestId('tile-piano').click();
    await page.getByTestId('tile-violin').click();
    await expect.poll(() => sampleStatus(page, 'violin'), { timeout: 15_000 }).toBe('ready');
    expect(await playRms(page, 'violin')).toBeGreaterThan(0.01);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('notas dos dedos', () => {
  test('Personalizado: escolher a nota de um dedo e tocá-la', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await pinNotes(page, { customNotes: LEGACY_CUSTOM_NOTES });
    await openScale(page);
    await page.getByTestId('note-mode-custom').click();
    await expect(page.getByTestId('note-mode-custom')).toHaveAttribute('aria-checked', 'true');
    // em Personalizado não há tónica nem escala
    await expect(page.getByTestId('tonic-at')).toHaveCount(0);
    await expect(page.getByTestId('scale-Maior')).toHaveCount(0);
    // o índice 7 é o médio direito (0..4 mão esquerda, 5..9 direita, polegar → mindinho)
    const finger = page.getByTestId('finger-note-7');
    await expect(finger).toHaveAttribute('aria-label', 'Mão direita, médio: Mi4. Mudar');
    await finger.click();
    await expect(page.getByTestId('note-editor')).toBeVisible();
    await expect(page.getByTestId('pick-note-4')).toBeFocused();
    await page.getByTestId('pick-note-7').click();
    await expect(finger).toHaveText('Sol4');
    await expect(finger).toHaveAttribute('aria-label', 'Mão direita, médio: Sol4. Mudar');
    // setas + Enter também escolhem; Esc fecha só o editor e devolve o foco ao dedo
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(finger).toHaveText('Sol♯4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(finger).toHaveText('Sol4');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('note-editor')).toHaveCount(0);
    await expect(finger).toBeFocused();
    await expect(page.getByTestId('drawer')).toBeVisible();

    expect(await playFinger(page, 1, 2)).toMatch(/^Sol/);
    expect(await playFinger(page, 1, 2)).toBe('Sol4');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Copiar da escala: as notas ficam iguais às da escala', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await pinNotes(page, {
      scale: 'Pentatónica',
      tonicAt: 'right-index',
      customNotes: LEGACY_CUSTOM_NOTES,
    });
    await openScale(page);
    await page.getByTestId('scale-Maior').click();
    await page.getByTestId('tonic-at-left-pinky').click();
    const scaleNotes = await fingerNotes(page);
    expect(scaleNotes).toHaveLength(8);
    await page.getByTestId('note-mode-custom').click();
    expect(await fingerNotes(page)).not.toEqual(scaleNotes);
    // substitui as notas: pede um segundo clique
    await page.getByTestId('copy-from-scale').click();
    await expect(page.getByTestId('copy-from-scale')).toHaveText('Substituir as notas?');
    expect(await fingerNotes(page)).not.toEqual(scaleNotes);
    await page.getByTestId('copy-from-scale').click();
    await expect.poll(() => fingerNotes(page)).toEqual(scaleNotes);
    await expect(page.getByTestId('copy-from-scale')).toHaveText('Copiar da escala');
    // já iguais: não pede confirmação e diz porquê
    await page.getByTestId('copy-from-scale').click();
    await expect(page.getByText('Já são iguais às da escala.')).toBeVisible();
    await expect(page.getByTestId('copy-from-scale')).toHaveText('Copiar da escala');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('tónica no mindinho esquerdo: toca a tónica na oitava base', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await pinNotes(page, { heightPitch: false, scale: 'Pentatónica', tonicAt: 'right-index' });
    await openScale(page);
    await expect(page.getByTestId('finger-note-6')).toHaveText('Dó4');
    await page.getByTestId('tonic-at-left-pinky').click();
    await expect(page.getByTestId('finger-note-4')).toHaveText('Dó4');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('drawer')).toBeHidden();
    expect(await playFinger(page, 0, 4)).toBe('Dó4');
    // o indicador direito passa a tocar mais acima (grau 4 da Pentatónica = Lá4)
    expect(await playFinger(page, 1, 1)).toBe('Lá4');
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('por defeito: Dó Maior do mindinho esquerdo ao direito, também no Personalizado', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    const dom = ['Dó4', 'Ré4', 'Mi4', 'Fá4', 'Sol4', 'Lá4', 'Si4', 'Dó5'];
    await openScale(page);
    await expect(page.getByTestId('scale-Maior')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('tonic-at-left-pinky')).toHaveAttribute('aria-checked', 'true');
    expect(await fingerNotes(page)).toEqual(dom);
    await page.getByTestId('note-mode-custom').click();
    // sem polegares: os 8 dedos à vista, com o Fá e a tónica
    await expect.poll(() => fingerNotes(page)).toEqual(dom);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('por defeito: o mindinho esquerdo toca Dó4, mesmo sozinho na metade direita', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    // cada teste abre num contexto novo: localStorage limpo, só com os valores por defeito
    await page.goto('/?debug');
    await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
    // a altura da mão não é uma nota: desliga-se para a nota ser a do dedo
    await pinNotes(page, { heightPitch: false });
    expect(await playFinger(page, 0, 4)).toBe('Dó4');
    // uma só mão esquerda na metade direita do ecrã, com o rótulo cru do MediaPipe ("Right"
    // numa imagem sem espelho = mão esquerda do utilizador)
    const note = await page.evaluate(async () => {
      const v = (window as unknown as { __vsc: Vsc }).__vsc;
      v.store.getState().set({ lastNote: '—' });
      const label = [{ label: 'Right' as const, score: 0.95 }];
      const open = [v.syntheticHand(false, 0.75)];
      const bent = [v.syntheticHand([false, false, false, false, true], 0.75)];
      const wait = () => new Promise((r) => setTimeout(r, 33));
      // sem mãos durante uns fotogramas: a mão que aparece a seguir é nova (sem continuidade)
      for (let k = 0; k < 10; k++) v.session.feedHands([]);
      for (const hands of [open, open, open, open, bent, bent, bent, bent, open, open]) {
        v.session.feedHands(hands, label);
        await wait();
      }
      return v.store.getState().lastNote;
    });
    expect(note).toBe('Dó4');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('altura da mão e arrastar', () => {
  /**
   * Dobra o indicador esquerdo com o pulso à altura `y0` e, sem o largar, leva a mão a `y1`.
   * Devolve a nota tocada e a nota MIDI da voz antes e depois de arrastar (null sem voz).
   */
  function bendAt(page: Page, y0: number, y1: number) {
    return page.evaluate(
      async ({ y0, y1 }) => {
        const v = (window as unknown as { __vsc: Vsc }).__vsc;
        v.store.getState().set({ lastNote: '—' });
        const hands = (bent: boolean, y: number) => [
          v.syntheticHand([false, bent, false, false, false], 0.3, y),
          v.syntheticHand(false, 0.7, y),
        ];
        const wait = () => new Promise((r) => setTimeout(r, 33));
        const feed = async (h: unknown[], n: number) => {
          for (let k = 0; k < n; k++) {
            v.session.feedHands(h);
            await wait();
          }
        };
        await feed(hands(false, y0), 4);
        await feed(hands(true, y0), 6);
        const note = v.store.getState().lastNote;
        const before = v.audio.voiceMidi(1);
        await feed(hands(true, y1), 12);
        const after = v.audio.voiceMidi(1);
        await feed(hands(false, y1), 4);
        return { note, before, after };
      },
      { y0, y1 },
    );
  }

  test('por defeito: a altura não muda a nota e arrastar dobra o tom', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
    await pinNotes(page, { instrument: 'organ', scale: 'Maior', tonicAt: 'left-pinky' });
    await page.evaluate(() =>
      (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ settingsOpen: true }),
    );
    await expect(page.getByTestId('height-pitch')).not.toBeChecked();
    await expect(page.getByTestId('glide')).toBeChecked();
    await page.keyboard.press('Escape');
    // indicador esquerdo = Fá4, a qualquer altura
    const low = await bendAt(page, 0.8, 0.8);
    const high = await bendAt(page, 0.4, 0.4);
    expect(low.note).toBe('Fá4');
    expect(high.note).toBe('Fá4');
    // arrastar 0.2 para cima: (0.2 − 0.02) × 20 = 3.6 meios-tons acima da nota tocada
    const up = await bendAt(page, 0.7, 0.5);
    expect(up.before).toBeCloseTo(65, 1);
    expect(up.after! - up.before!).toBeGreaterThan(3);
    expect(up.after! - up.before!).toBeLessThan(3.7);
    // também no Personalizado, a partir da nota exata do dedo
    await pinNotes(page, { noteMode: 'custom' });
    const custom = await bendAt(page, 0.7, 0.5);
    expect(custom.after! - custom.before!).toBeGreaterThan(3);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('com a altura ligada, a mão mais acima toca mais agudo', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
    await pinNotes(page, {
      instrument: 'organ',
      scale: 'Maior',
      tonicAt: 'left-pinky',
      heightPitch: true,
      glide: false,
    });
    // 0.55 é o centro (Fá4); 0.35 sobe 2 graus (Lá4)
    expect((await bendAt(page, 0.55, 0.55)).note).toBe('Fá4');
    const high = await bendAt(page, 0.35, 0.2);
    expect(high.note).toBe('Lá4');
    // sem arrastar, a voz fica na nota tocada
    expect(high.after).toBeCloseTo(high.before!, 3);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
