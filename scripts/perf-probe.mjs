// Mede FPS do rAF, intervalo p95 entre fotogramas e canvases visíveis durante 15 s a tocar.
// Uso: node scripts/perf-probe.mjs [url]   (por defeito http://localhost:4173/?debug)
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/?debug';
const b = await chromium.launch({
  channel: 'chromium',
  args: [
    ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
const p = await ctx.newPage();
await p.goto(url);
await p.evaluate(() => localStorage.clear());
await p.reload();
await p.getByTestId('start').click();
await p.waitForTimeout(4000);
const r = await p.evaluate(
  () =>
    new Promise((res) => {
      const v = window.__vsc;
      let t = 0;
      const feed = setInterval(() => {
        t++;
        const bent = t % 8 < 4;
        v.session.feedHands([
          v.syntheticHand([false, false, bent, false, false], 0.3),
          v.syntheticHand(false, 0.7),
        ]);
      }, 33);
      const ts = [];
      const t0 = performance.now();
      const f = (now) => {
        ts.push(now);
        if (now - t0 < 15000) return requestAnimationFrame(f);
        clearInterval(feed);
        const d = ts
          .slice(1)
          .map((x, i) => x - ts[i])
          .sort((a, b) => a - b);
        const canvases = [...document.querySelectorAll('canvas')].filter((c) => {
          const bb = c.getBoundingClientRect();
          return bb.width > 0 && bb.height > 0;
        }).length;
        res({
          fps: Math.round((ts.length - 1) / ((ts.at(-1) - ts[0]) / 1000)),
          p95: +d[Math.floor(d.length * 0.95)].toFixed(1),
          canvases,
        });
      };
      requestAnimationFrame(f);
    }),
);
console.log(JSON.stringify(r));
await b.close();
