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

/** Liga o palco sem câmara (o ecrã inicial sai e aparecem o HUD e as pills). */
function markStarted(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ started: true }),
  );
}

/** Liga o áudio e abre a folha na tab Notas. */
async function openScale(page: Page) {
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await markStarted(page);
  await page.getByTestId('pill-scale').click();
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

/** Liga o áudio (como faria o primeiro gesto) e abre a folha na tab Som pela pill. */
async function openInstruments(page: Page) {
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await markStarted(page);
  await page.getByTestId('pill-instrument').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
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

  // tab Som: todos os instrumentos
  await page.getByTestId('pill-instrument').click();
  const drawer = page.getByTestId('sheet');
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

  // Esc fecha e devolve o foco à pill
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(page.getByTestId('pill-instrument')).toBeFocused();

  // teclado (modo teclado) com um instrumento melódico
  await page.locator('body').click({ position: { x: 5, y: 300 } });
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

  // tocar com o rato (botão do cabeçalho): teclado de piano e pads
  await page.getByTestId('touch-keys').click();
  const touch = page.getByTestId('touch-keys-panel');
  const key = touch.locator('[data-testid^="key-"]').nth(5);
  await key.hover();
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'drums' }),
  );
  await touch.getByTestId('pad-1').click();
  await expect(page.getByTestId('hud-note')).toHaveText('Tarola');
  await page.getByTestId('touch-keys').click();

  // pipeline real de gestos com mãos sintéticas: dobrar o médio esquerdo dispara uma nota
  await page.evaluate(() =>
    (window as unknown as { __vsc: Vsc }).__vsc.store.getState().set({ instrument: 'marimba' }),
  );
  const note = await playSynthetic(page);
  expect(note).toMatch(/^(Dó|Ré|Mi|Fá|Sol|Lá|Si)♯?\d$/);
  // a faixa de ondas no fundo do palco desenha: há píxeis opacos na coluna do meio
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

  // gravar 2 s pelo cabeçalho; o aviso "Ver" abre o Estúdio com a gravação
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(2000);
  await page.getByTestId('record').click();
  // as mensagens de estado têm prioridade sobre o aviso
  await pinNotes(page, { status: '' });
  const notice = page.getByTestId('notice');
  await expect(notice).toContainText('Gravação 1 guardada', { timeout: 10_000 });
  await notice.getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByTestId('tab-estudio')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('recording-item')).toHaveCount(1, { timeout: 10_000 });
  // com o Estúdio já aberto, o "Ver" da gravação seguinte não o fecha
  await page.getByTestId('record').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('record').click();
  await pinNotes(page, { status: '' });
  await expect(notice).toContainText('Gravação 2 guardada', { timeout: 10_000 });
  await notice.getByRole('button', { name: 'Ver' }).click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await expect(page.getByTestId('recording-item')).toHaveCount(2, { timeout: 10_000 });
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
  // com os polegares continuam 8: os polegares não aprendem (tocam ao mexer-se, decisão 65)
  await page.evaluate(() =>
    (window as unknown as Dbg).__vsc.store.getState().set({ thumbs: true }),
  );
  await expect(settings.getByTestId('learned-bars').locator('span[role="img"]')).toHaveCount(8);
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

type Box = { x: number; y: number; width: number; height: number };

/** Caixa de um elemento depois de as transições acabarem (a folha entra a deslizar). */
async function stableBox(loc: ReturnType<Page['getByTestId']>): Promise<Box> {
  // a transição pode ainda não ter arrancado: dá-lhe uns fotogramas e espera que acabe
  await loc.evaluate(
    (el) =>
      new Promise<void>((r) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            Promise.all(el.getAnimations().map((a) => a.finished)).then(() => r()),
          ),
        ),
      ),
  );
  let prev = await loc.boundingBox();
  for (let k = 0; k < 40; k++) {
    await new Promise((r) => setTimeout(r, 100));
    const b = await loc.boundingBox();
    if (b && prev && JSON.stringify(b) === JSON.stringify(prev)) return b;
    prev = b;
  }
  return prev!;
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Estado do store (só os campos que os testes de interface leem). */
type UiState = {
  chord: string;
  sheet: string | null;
  sheetTab: string;
  uiHidden: boolean;
  reverb: number;
  mouthFx: string;
  instrument: string;
  engine: string;
  coachDone: string[];
  userPresets: Record<string, unknown>;
};
const ui = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { __vsc: { store: { getState(): UiState } } }).__vsc.store.getState(),
  );
const uiField = <K extends keyof UiState>(page: Page, k: K) =>
  page.evaluate(
    (k) =>
      (window as unknown as { __vsc: { store: { getState(): UiState } } }).__vsc.store.getState()[
        k as keyof UiState
      ],
    k,
  ) as Promise<UiState[K]>;

test('esconder interface com I e voltar com Esc', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('i');
  await expect(page.getByTestId('dock')).toHaveCSS('opacity', '0');
  await expect(page.getByRole('banner')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('dock')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('banner')).toBeVisible();
  // com a interface escondida e a folha aberta, um Esc só fecha a folha
  await page.keyboard.press('i');
  await page.keyboard.press('2');
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('tab-notas').focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sheet')).toBeHidden();
  expect(await uiField(page, 'uiHidden')).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('ecrã inicial: só o Começar, a privacidade e o caminho sem câmara', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await expect(page.getByTestId('start')).toBeVisible();
  await expect(page.getByTestId('start')).toHaveAccessibleName(/Começar/);
  await expect(page.getByText('O vídeo fica no teu dispositivo')).toBeVisible();
  await expect(page.getByTestId('start-touch')).toBeVisible();
  // antes de começar não há pills, HUD nem botões no cabeçalho
  await expect(page.getByTestId('pills')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toHaveCount(0);
  await expect(page.getByRole('banner').getByRole('button')).toHaveCount(0);
  // o botão é redondo, com pelo menos 72 px
  const play = (await page.getByTestId('start').locator('span').first().boundingBox())!;
  expect(play.width).toBeGreaterThanOrEqual(72);
  expect(Math.abs(play.width - play.height)).toBeLessThan(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sem câmara: tocar no ecrã, dica e ligar a câmara depois', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('start-touch').click();
  await expect(page.getByTestId('start')).toHaveCount(0);
  expect(await uiField(page, 'engine')).toBe('keyboard');
  const keys = page.getByTestId('touch-keys-panel');
  await expect(keys).toBeVisible();
  await expect(page.getByTestId('touch-keys')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('coach')).toContainText('Toca nas teclas');
  // as pills ficam por cima do teclado, sem o tapar
  expect(
    overlaps((await page.getByTestId('pills').boundingBox())!, (await keys.boundingBox())!),
  ).toBe(false);
  const key = keys.locator('[data-testid^="key-"]').nth(5);
  await key.hover();
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await expect(page.getByTestId('hud-note')).not.toHaveText('—');
  await expect(page.getByTestId('coach')).toHaveCount(0);
  expect(await uiField(page, 'coachDone')).toContain('touch');
  // percussão: os pads no lugar do piano
  await pinNotes(page, { instrument: 'drums' });
  await keys.getByTestId('pad-1').click();
  await expect(page.getByTestId('hud-note')).toHaveText('Tarola');
  // o botão do cabeçalho esconde o teclado
  await page.getByTestId('touch-keys').click();
  await expect(keys).toHaveCount(0);
  // o HUD oferece ligar a câmara
  await page.getByTestId('hud-camera').click();
  await expect.poll(() => uiField(page, 'engine'), { timeout: 30_000 }).toBe('hands');
  await expect(page.getByTestId('hud-camera')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('câmara recusada: o cartão oferece tentar outra vez ou tocar no ecrã', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('negado', 'NotAllowedError'));
  });
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.getByTestId('start').click();
  const card = page.getByTestId('camera-error');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sem acesso à câmara');
  // tentar outra vez volta a pedir a câmara (e volta a falhar)
  await card.getByRole('button', { name: 'Tentar outra vez' }).click();
  await expect(card).toBeVisible();
  await card.getByTestId('camera-error-touch').click();
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('touch-keys-panel')).toBeVisible();
  expect(await uiField(page, 'engine')).toBe('keyboard');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('dicas: mãos, depois dobrar; cumpridas não voltam', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await pinNotes(page, { started: true, engine: 'hands', status: '', coachDone: [] });
  const coach = page.getByTestId('coach');
  await expect(coach).toContainText('Mostra as duas mãos');
  await page.evaluate(async () => {
    const v = (window as unknown as { __vsc: Vsc }).__vsc;
    const open = [v.syntheticHand(false, 0.3), v.syntheticHand(false, 0.7)];
    for (let k = 0; k < 4; k++) {
      v.session.feedHands(open);
      await new Promise((r) => setTimeout(r, 33));
    }
  });
  await expect(coach).toContainText('Dobra um dedo');
  // uma nota do teclado do computador não conta como dobrar um dedo
  await pinNotes(page, { engine: 'keyboard' });
  await page.keyboard.down('s');
  await page.waitForTimeout(60);
  await page.keyboard.up('s');
  await pinNotes(page, { engine: 'hands', status: '' });
  await expect(coach).toContainText('Dobra um dedo');
  expect(await uiField(page, 'coachDone')).not.toContain('bend');
  await pinNotes(page, { status: '' });
  await playSynthetic(page);
  await pinNotes(page, { status: '' });
  await expect(coach).toHaveCount(0);
  expect(await uiField(page, 'coachDone')).toEqual(expect.arrayContaining(['hands', 'bend']));
  // ao recarregar, ficam cumpridas
  await page.reload();
  await pinNotes(page, { started: true, engine: 'hands', status: '' });
  await page.waitForTimeout(300);
  await expect(page.getByTestId('coach')).toHaveCount(0);
  // o ✕ dispensa todas
  await pinNotes(page, { coachDone: [] });
  await expect(page.getByTestId('coach')).toBeVisible();
  await page.getByTestId('coach').getByRole('button', { name: 'Dispensar as dicas' }).click();
  expect(await uiField(page, 'coachDone')).toEqual(['hands', 'bend', 'mouth', 'touch']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('folha: as pills abrem a tab certa, 1–4, Esc, tocar fora e a última tab', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  const sheet = page.getByTestId('sheet');
  await page.getByTestId('pill-instrument').click();
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('tab-som')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('tab-som')).toBeFocused();
  await expect(sheet.getByTestId('instruments')).toBeVisible();
  await expect(sheet.getByTestId('presets')).toBeVisible();
  // não é modal: o palco continua por trás, sem fundo escuro
  expect(await sheet.evaluate((d) => d.matches(':modal'))).toBe(false);
  // a mesma pill fecha; a outra abre a sua tab
  await page.getByTestId('pill-scale').click();
  await expect(page.getByTestId('tab-notas')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('scale-panel')).toBeVisible();
  // setas entre tabs
  await page.getByTestId('tab-notas').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tab-efeitos')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('tab-efeitos')).toBeFocused();
  await expect(sheet.getByTestId('effects')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tab-estudio')).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByTestId('looper')).toBeVisible();
  // Esc fecha e devolve o foco à pill que a abriu
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('pill-instrument')).toBeFocused();
  // 1–4 abrem cada tab; a mesma tecla fecha
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('3');
  await expect(page.getByTestId('tab-efeitos')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('2');
  await expect(page.getByTestId('tab-notas')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('2');
  await expect(sheet).toBeHidden();
  // tocar fora (no palco) fecha; deslizar para cima nas pills reabre na última tab
  await page.keyboard.press('4');
  await expect(sheet).toBeVisible();
  const stage = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.click(stage.x + 40, stage.y + stage.height / 2);
  await expect(sheet).toBeHidden();
  expect(await uiField(page, 'sheetTab')).toBe('estudio');
  // as notas tocam com a folha aberta
  await page.keyboard.press('1');
  await expect(sheet).toBeVisible();
  await page.keyboard.down('s');
  await page.waitForTimeout(60);
  await page.keyboard.up('s');
  await expect(page.getByTestId('hud-note')).not.toHaveText('—');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('com a folha aberta, I e E não mexem na interface', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  await page.getByTestId('pill-scale').click();
  const sheet = page.getByTestId('sheet');
  await expect(sheet).toBeVisible();
  await page.getByTestId('sheet-close').focus();
  await page.keyboard.press('i');
  await page.keyboard.press('e');
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(() => ({
      uiHidden: (window as unknown as { __vsc: Vsc }).__vsc.store.getState().uiHidden,
      fullscreen: !!document.fullscreenElement,
    })),
  ).toEqual({ uiHidden: false, fullscreen: false });
  await expect(sheet).toBeVisible();
  // o ✕ fecha
  await page.getByTestId('sheet-close').click();
  await expect(sheet).toBeHidden();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('desktop: a folha fica à direita, por cima do palco, que não encolhe', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?debug');
  await markStarted(page);
  const before = (await page.getByTestId('stage').boundingBox())!;
  await page.getByTestId('pill-instrument').click();
  const sheet = await stableBox(page.getByTestId('sheet'));
  expect(sheet.x + sheet.width).toBeCloseTo(1440, 0);
  expect(sheet.y + sheet.height).toBeCloseTo(900, 0);
  // começa por baixo do cabeçalho: gravar e as definições continuam à mão
  for (const id of ['record', 'settings-open'])
    expect(overlaps(sheet, (await page.getByTestId(id).boundingBox())!), id).toBe(false);
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('record').click();
  await expect(page.getByTestId('record')).toHaveAttribute('aria-pressed', 'false');
  expect(sheet.width).toBeLessThanOrEqual(400);
  await expect(page.getByTestId('sheet-grip')).toHaveCount(0);
  expect(await page.getByTestId('stage').boundingBox()).toEqual(before);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Notas: tónica, escalas com "+ mais", formas de tocar e oitava', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await pinNotes(page, { root: 0, scale: 'Maior', chord: 'off', octave: 4, noteMode: 'scale' });
  await openScale(page);
  const panel = page.getByTestId('scale-panel');
  // tónica em pills
  await panel.getByTestId('root-7').click();
  await expect(page.getByTestId('pill-scale')).toContainText('Sol · Maior');
  // 5 escalas à vista; "+ mais" mostra as outras
  await expect(
    panel.locator('[data-testid^="scale-"]:not([data-testid="scale-more"])'),
  ).toHaveCount(5);
  await expect(panel.getByTestId('scale-Dórica')).toHaveCount(0);
  await panel.getByTestId('scale-more').click();
  await panel.getByTestId('scale-Dórica').click();
  await panel.getByTestId('scale-more').click();
  // a escolhida continua à vista com a lista fechada
  await expect(panel.getByTestId('scale-Dórica')).toHaveAttribute('aria-checked', 'true');
  // formas de tocar em cartões, com a explicação do modo ativo sempre à vista
  await panel.getByTestId('chord-card-seventh').click();
  await expect(panel.getByTestId('chord-card-seventh')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.getByText('4 notas, com a 7.ª')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByTestId('chord-card-ninth')).toBeFocused();
  // a pré-visualização mostra o acorde de cada dedo
  await expect(panel.getByText('Em Sol Dórica, os teus dedos tocam')).toBeVisible();
  await expect(panel.getByTestId('finger-note-4')).toContainText('9');
  // oitava base em pills
  await panel.getByTestId('octave-3').click();
  expect(
    await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.store.getState()),
  ).toMatchObject({ octave: 3, root: 7, scale: 'Dórica', chord: 'ninth' });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('forma de tocar no desktop: tira sempre à vista, setas e tecla C', async ({ page }) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?debug');
  await markStarted(page);
  const checked = (id: string) =>
    expect(page.getByTestId(`chord-${id}`)).toHaveAttribute('aria-checked', 'true');
  const strip = page.getByTestId('chord-strip');
  await expect(strip).toBeVisible();
  await expect(strip).toContainText('Cada dedo toca…');
  await expect(page.getByTestId('pill-chord')).toHaveCount(0);
  await expect(strip.getByRole('radio')).toHaveText([
    'Uma nota',
    'Oitava',
    'Quinta',
    'Acorde',
    'Suspenso',
    'Sétima',
    'Nona',
  ]);
  await expect(strip).toBeInViewport({ ratio: 1 });
  // por cima das pills, sem lhes tocar
  expect(
    overlaps((await strip.boundingBox())!, (await page.getByTestId('pills').boundingBox())!),
  ).toBe(false);
  await checked('off');
  await page.getByTestId('chord-power').click();
  await checked('power');
  await expect(page.getByTestId('chord-power')).toHaveAttribute('title', /power chord/);
  // teclado: a opção escolhida é a única no Tab; as setas mudam de opção
  await page.keyboard.press('ArrowRight');
  await checked('triad');
  await expect(page.getByTestId('chord-triad')).toBeFocused();
  await expect(page.getByTestId('chord-power')).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('End');
  await checked('ninth');
  await page.keyboard.press('Home');
  await checked('off');
  // C passa ao seguinte, pela mesma ordem, e volta ao início
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  for (const id of ['octave', 'power', 'triad', 'sus4', 'seventh', 'ninth', 'off']) {
    await page.keyboard.press('c');
    await checked(id);
  }
  // esconde-se com a interface
  await page.keyboard.press('i');
  await expect(page.getByTestId('dock')).toHaveCSS('visibility', 'hidden');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('sem Fullscreen API (iPhone), o botão esconde a interface', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false }),
  );
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  await page.getByTestId('fullscreen').click();
  await expect(page.getByTestId('dock')).toHaveCSS('opacity', '0');
  // escondido, o fundo sai da ordem do Tab
  await expect(page.getByTestId('dock')).toHaveCSS('visibility', 'hidden');
  // mexer espreita: o cabeçalho e o fundo voltam por uns segundos
  await page.mouse.move(200, 200);
  await page.mouse.move(220, 220);
  await expect(page.getByTestId('dock')).toHaveCSS('opacity', '1');
  // nas definições, "Esconder a interface" volta a mostrá-la
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('hide-ui')).toBeChecked();
  await page.getByTestId('hide-ui').click({ force: true });
  await expect.poll(() => uiField(page, 'uiHidden')).toBe(false);
  await expect(page.getByTestId('dock')).toHaveCSS('opacity', '1');
  await expect(page.locator('header').first()).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('câmara em retrato no desktop: o palco continua panorâmico e as pills dentro dele', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/?debug');
  await markStarted(page);
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
  await expect(page.getByTestId('overlay')).toHaveCSS('object-fit', 'cover');
  const pills = (await page.getByTestId('pills').boundingBox())!;
  expect(pills.x).toBeGreaterThanOrEqual(stage.x);
  expect(pills.x + pills.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5);
  expect(pills.y + pills.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5);
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
    await markStarted(page);
    await expect(page.getByTestId('pill-instrument')).toContainText('Marimba');
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
  { width: 375, height: 812 },
  { width: 844, height: 390 },
  { width: 320, height: 568 },
];

for (const vp of VIEWPORTS) {
  test(`layout ${vp.width}×${vp.height}: sem scroll horizontal, palco e pills à vista`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.setViewportSize(vp);
    await page.goto('/?debug');
    await markStarted(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByTestId('stage')).toBeInViewport();
    for (const id of ['pills', 'pill-instrument', 'pill-scale', 'record', 'settings-open'])
      await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
    // alvos de toque: pelo menos 44×44
    for (const id of ['pill-instrument', 'pill-scale', 'record', 'settings-open', 'touch-keys']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(Math.min(b.width, b.height), id).toBeGreaterThanOrEqual(44);
    }
    // ecrã inteiro só a partir de 640 px
    if (vp.width < 640) await expect(page.getByTestId('fullscreen')).toBeHidden();
    else await expect(page.getByTestId('fullscreen')).toBeVisible();
    // as ondas encostam ao fundo do palco, dentro do ecrã
    const waves = page.getByTestId('waves');
    await expect(waves).toBeInViewport({ ratio: 1 });
    const stageBox = (await page.getByTestId('stage').boundingBox())!;
    const wavesBox = (await waves.boundingBox())!;
    expect(wavesBox.y + wavesBox.height).toBeCloseTo(stageBox.y + stageBox.height, -1);
    // a folha abre dentro do ecrã, com as tabs à vista
    await page.getByTestId('pill-scale').click();
    const sheet = await stableBox(page.getByTestId('sheet'));
    expect(sheet.x).toBeGreaterThanOrEqual(-0.5);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(vp.height + 0.5);
    for (const t of ['som', 'notas', 'efeitos', 'estudio'])
      await expect(page.getByTestId(`tab-${t}`)).toBeInViewport({ ratio: 1 });
    // o antigo shell saiu
    for (const id of ['control-bar', 'more', 'chord-column', 'effects-footer', 'drawer'])
      await expect(page.getByTestId(id)).toHaveCount(0);
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
    expect(stage.height).toBeGreaterThanOrEqual(vp.height * 0.8);
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

test('Efeitos: boca primeiro, os 5 knobs com o nome e Repor efeitos', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  await page.keyboard.press('3');
  const fx = page.getByTestId('effects');
  await expect(fx).toBeVisible();
  // o efeito da boca vem antes dos knobs
  const mouth = fx.getByTestId('mouth-fx');
  const knob = fx.getByTestId('knob-reverb');
  expect((await mouth.boundingBox())!.y).toBeLessThan((await knob.boundingBox())!.y);
  await expect(mouth).toHaveAccessibleName('Efeito da boca');
  const names = { reverb: 'Reverb', echo: 'Eco', filter: 'Filtro', drive: 'Drive', pitch: 'Pitch' };
  for (const [id, name] of Object.entries(names)) {
    const k = fx.getByTestId(`knob-${id}`);
    await expect(k).toHaveAccessibleName(name);
    await expect(k.locator('..').getByText(name, { exact: true })).toBeVisible();
  }
  // o knob mexe-se com o teclado e muda o valor no store
  const before = await uiField(page, 'reverb');
  await knob.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => uiField(page, 'reverb')).toBeCloseTo(before + 0.01, 5);
  // as pills da boca mudam o efeito; as setas também
  await mouth.getByTestId('mouth-vibrato').click();
  expect(await uiField(page, 'mouthFx')).toBe('vibrato');
  await page.keyboard.press('ArrowRight');
  expect(await uiField(page, 'mouthFx')).toBe('robot');
  // Repor efeitos pede um segundo toque
  const reset = fx.getByTestId('fx-reset');
  await reset.click();
  expect(await uiField(page, 'mouthFx')).toBe('robot');
  await expect(reset).toContainText('Repor?');
  await reset.click();
  expect(await ui(page)).toMatchObject({ reverb: 0.3, mouthFx: 'wah' });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Som: sons guardados carregam num toque, guardam-se e apagam-se com confirmação', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await markStarted(page);
  await page.getByTestId('pill-instrument').click();
  const presets = page.getByTestId('presets');
  await presets.getByTestId('preset-Theremin espacial').click();
  expect(await uiField(page, 'instrument')).toBe('theremin');
  await expect(presets.getByTestId('preset-Theremin espacial')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(presets.getByTestId('preset-Piano calmo')).toHaveAttribute('aria-pressed', 'false');
  // guardar com um nome; o novo fica marcado (é o som atual)
  await presets.getByTestId('preset-add').click();
  await presets.getByTestId('preset-name').fill('O meu');
  await presets.getByTestId('preset-name').press('Enter');
  await expect(presets.getByTestId('preset-O meu')).toHaveAttribute('aria-pressed', 'true');
  expect(Object.keys(await uiField(page, 'userPresets'))).toEqual(['O meu']);
  // apagar: ✕ e um segundo toque
  const del = presets.getByRole('button', { name: 'Apagar O meu' });
  await del.click();
  await presets.getByRole('button', { name: 'Confirmar: apagar O meu' }).click();
  await expect(presets.getByTestId('preset-O meu')).toHaveCount(0);
  expect(await uiField(page, 'userPresets')).toEqual({});
  // filtros por família e grelha por categoria
  await page.getByTestId('family-Cordas').click();
  await expect(page.getByTestId('instruments').locator('h4')).toHaveText([/Cordas/]);
  await page.getByTestId('family-Todos').click();
  await expect(page.getByTestId('instruments').locator('h4')).toHaveCount(6);
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('telemóvel 375×812 (toque)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('a folha fica em baixo, a 45% da altura, e a pega expande e fecha', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await markStarted(page);
    await page.getByTestId('pill-instrument').tap();
    const sheet = page.getByTestId('sheet');
    await expect(sheet).toBeVisible();
    const box = await stableBox(sheet);
    expect(box.y + box.height).toBeCloseTo(812, 0);
    expect(box.height).toBeCloseTo(812 * 0.45, -1);
    expect(box.width).toBeCloseTo(375, 0);
    // as tabs e o ✕ têm pelo menos 44 px
    for (const id of ['tab-som', 'tab-notas', 'tab-efeitos', 'tab-estudio', 'sheet-close']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(44);
    }
    // arrastar a pega para cima expande; para baixo encolhe e depois fecha
    const grip = page.getByTestId('sheet-grip');
    const drag = async (dy: number) => {
      const g = (await grip.boundingBox())!;
      const x = g.x + g.width / 2;
      const y = g.y + g.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + dy / 2);
      await page.mouse.move(x, y + dy);
      await page.mouse.up();
    };
    await drag(-120);
    expect((await stableBox(sheet)).height).toBeCloseTo(812 * 0.85, -1);
    await drag(150);
    expect((await stableBox(sheet)).height).toBeCloseTo(812 * 0.45, -1);
    await drag(150);
    await expect(sheet).toBeHidden();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('forma de tocar: a pill abre a tira, escolher fecha-a e explica o modo', async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await markStarted(page);
    const strip = page.getByTestId('chord-strip');
    await expect(strip).toHaveCount(0);
    await page.getByTestId('pill-chord').tap();
    await expect(strip).toBeVisible();
    await expect(strip).toBeInViewport({ ratio: 1 });
    await expect(strip.getByRole('radio')).toHaveCount(7);
    for (const r of await strip.getByRole('radio').all()) {
      const b = (await r.boundingBox())!;
      expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    }
    await page.getByTestId('chord-seventh').tap();
    await expect(strip).toHaveCount(0);
    expect(await uiField(page, 'chord')).toBe('seventh');
    await expect(page.getByTestId('notice')).toContainText('Sétima: 4 notas');
    await expect(page.getByTestId('notice')).toHaveCount(0, { timeout: 5000 });
    // tocar fora fecha sem escolher
    await page.getByTestId('pill-chord').tap();
    await expect(strip).toBeVisible();
    await page.touchscreen.tap(180, 300);
    await expect(strip).toHaveCount(0);
    expect(await uiField(page, 'chord')).toBe('seventh');
    // abrir a folha fecha a tira
    await page.getByTestId('pill-chord').tap();
    await page.getByTestId('pill-scale').tap();
    await expect(strip).toHaveCount(0);
    await expect(page.getByTestId('sheet')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('definições em ecrã inteiro, com Voltar', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await markStarted(page);
    await page.getByTestId('settings-open').tap();
    const settings = page.getByTestId('settings');
    await expect(settings).toBeVisible();
    const box = (await settings.boundingBox())!;
    expect(box.width).toBeCloseTo(375, 0);
    expect(box.height).toBeCloseTo(812, 0);
    // sem rato, os atalhos não aparecem
    await expect(settings.getByRole('heading', { name: 'Atalhos' })).toHaveCount(0);
    await expect(settings.getByTestId('settings-close')).toBeHidden();
    await settings.getByTestId('settings-back').tap();
    await expect(settings).toBeHidden();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('tablet 820×1180 (toque)', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('folha em baixo, centrada e com 640 px no máximo; tira a pedido', async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto('/?debug');
    await markStarted(page);
    await expect(page.getByTestId('pill-chord')).toBeVisible();
    await page.getByTestId('pill-scale').tap();
    const box = await stableBox(page.getByTestId('sheet'));
    expect(box.width).toBeLessThanOrEqual(640.5);
    expect(box.x).toBeCloseTo((820 - box.width) / 2, 0);
    expect(box.y + box.height).toBeCloseTo(1180, 0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('paisagem 1180×820: folha à direita e a tira sempre à vista', async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto('/?debug');
    await markStarted(page);
    await expect(page.getByTestId('chord-strip')).toBeVisible();
    await page.getByTestId('pill-instrument').tap();
    const box = await stableBox(page.getByTestId('sheet'));
    expect(box.x + box.width).toBeCloseTo(1180, 0);
    expect(box.y + box.height).toBeCloseTo(820, 0);
    expect(overlaps(box, (await page.getByTestId('record').boundingBox())!)).toBe(false);
    expect(errors, errors.join('\n')).toEqual([]);
  });
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

/** Diagnóstico com a pose da mão sintética e o estado ao vivo dos dedos. */
type ThumbVsc = Vsc & {
  syntheticHand(closed: boolean[] | boolean, x?: number, y?: number, pose?: object): unknown;
  live: { fingers: { down: boolean; curl: number }[] };
};

test('polegar: dobrar toca a nota do polegar, mesmo com a mão inclinada, e parar solta', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/?debug');
  await page.evaluate(() => (window as unknown as { __vsc: Vsc }).__vsc.session.ensureAudio());
  await pinNotes(page, {
    started: true,
    instrument: 'synth',
    chord: 'off',
    noteMode: 'scale',
    thumbs: true,
    calibration: null,
    learnHand: false,
    lastNote: '—',
  });
  const r = await page.evaluate(async () => {
    const v = (window as unknown as { __vsc: ThumbVsc }).__vsc;
    const wait = () => new Promise((res) => setTimeout(res, 33));
    // mão esquerda inclinada e rodada, com o polegar entre o repouso (0) e encostado (1)
    const pose = { rot: 25, tilt: 45 };
    const hands = (thumb: number) => [
      v.syntheticHand(false, 0.3, 0.8, { ...pose, thumb }),
      v.syntheticHand(false, 0.7),
    ];
    const feed = async (thumb: number, n: number) => {
      for (let k = 0; k < n; k++) {
        v.session.feedHands(hands(thumb));
        await wait();
      }
    };
    await feed(0, 10);
    const idle = v.store.getState().lastNote;
    await feed(0.5, 1);
    await feed(1, 4);
    const held = {
      note: v.store.getState().lastNote,
      midi: v.audio.voiceMidi(0),
      down: v.live.fingers[0].down,
      curl: v.live.fingers[0].curl,
    };
    // parado, a nota solta sozinha; voltar ao sítio de partida não toca outra vez
    await feed(1, 26);
    const stopped = { midi: v.audio.voiceMidi(0), down: v.live.fingers[0].down };
    v.store.getState().set({ lastNote: '—' });
    await feed(0, 15);
    return {
      idle,
      held,
      stopped,
      back: v.store.getState().lastNote,
      others: [1, 2, 3, 4].some((i) => v.live.fingers[i].down),
    };
  });
  expect(r.idle).toBe('—');
  expect(r.held.note).not.toBe('—');
  expect(r.held.midi).not.toBeNull();
  expect(r.held.down).toBe(true);
  expect(r.held.curl).toBeGreaterThan(0.65);
  expect(r.stopped).toEqual({ midi: null, down: false });
  expect(r.back).toBe('—');
  expect(r.others).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

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
    await expect(page.getByTestId('pill-instrument')).toHaveAttribute(
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
    await expect(page.getByTestId('pill-instrument')).toHaveAttribute(
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
    await expect(page.getByTestId('pill-instrument')).toHaveAttribute(
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
    await expect(page.getByTestId('sheet')).toBeVisible();

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
    await expect(page.getByTestId('sheet')).toBeHidden();
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
