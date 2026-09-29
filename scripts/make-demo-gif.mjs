// Gera docs/demo.gif: mãos sintéticas animadas passam pelo pipeline real (gestos → som →
// overlay → partículas) e o Playwright captura a interface. Precisa de `npm run dev` a correr.
//   node scripts/make-demo-gif.mjs [url]
import { chromium } from '@playwright/test';
import gifenc from 'gifenc';
import pngjs from 'pngjs';

const { GIFEncoder, applyPalette, quantize } = gifenc;
const { PNG } = pngjs;
import { writeFile } from 'node:fs/promises';

const url = process.argv[2] ?? 'http://localhost:5173/?debug';
const W = 1200;
const H = 740;
const FRAMES = 56;

const b = await chromium.launch({
  channel: 'chromium',
  args: [
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-angle=metal',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await b.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 0.6,
  permissions: ['camera'],
});
const p = await ctx.newPage();
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.getByTestId('start').click();
await p.waitForTimeout(3500);
await p.evaluate(() => {
  const v = window.__vsc;
  v.store.getState().set({ showVideo: false, instrument: 'marimba', status: '' });
  let t = 0;
  // sequência: mindinho esquerdo → mindinho direito, e de volta
  const order = [4, 3, 2, 1, 6, 7, 8, 9, 8, 7, 6, 1, 2, 3];
  window.__demo = setInterval(() => {
    t++;
    const step = Math.floor(t / 7) % order.length;
    const f = order[step];
    const bent = t % 7 < 4;
    const L = [false, false, false, false, false];
    const R = [false, false, false, false, false];
    if (bent) (f < 5 ? L : R)[f % 5] = true;
    const sway = Math.sin(t / 14) * 0.02;
    v.session.feedHands([
      v.syntheticHand(L, 0.3 + sway, 0.78 - sway),
      v.syntheticHand(R, 0.64 - sway, 0.78 + sway),
    ]);
    v.live.spaceHeld = step > 9;
  }, 33);
});
await p.waitForTimeout(1200);

const gif = GIFEncoder();
for (let k = 0; k < FRAMES; k++) {
  const png = PNG.sync.read(await p.screenshot());
  const palette = quantize(png.data, 128);
  gif.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay: 90 });
  await p.waitForTimeout(40);
}
gif.finish();
await writeFile(new URL('../docs/demo.gif', import.meta.url), gif.bytes());
await b.close();
console.log('docs/demo.gif gerado.');
