// Teste de fugas: N min (MIN=10) a tocar sem parar contra `npm run dev`; mede heap JS, vozes e intervalos ativos.
import { chromium } from '@playwright/test';
const MIN = +(process.env.MIN || 10);
const b = await chromium.launch({
  channel: 'chromium',
  args: [
    '--use-angle=metal',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ],
});
const ctx = await b.newContext({ permissions: ['camera'] });
await ctx.addInitScript(() => {
  const live = new Set();
  const si = window.setInterval,
    ci = window.clearInterval;
  window.setInterval = (...a) => {
    const id = si(...a);
    live.add(id);
    return id;
  };
  window.clearInterval = (id) => {
    live.delete(id);
    return ci(id);
  };
  window.__intervals = live;
});
const p = await ctx.newPage();
let errs = 0;
p.on('pageerror', (e) => {
  errs++;
  console.log('[pageerror]', e.message);
});
await p.goto('http://localhost:5173/');
await p.getByTestId('start').click();
await p.waitForTimeout(4000);
await p.evaluate(() => {
  const v = window.__vsc;
  const ids = [
    'piano',
    'epiano',
    'organ',
    'harpsichord',
    'musicbox',
    'pluck',
    'harp',
    'violin',
    'cello',
    'bass',
    'flute',
    'brass',
    'choir',
    'sax',
    'marimba',
    'vibes',
    'kalimba',
    'bell',
    'steel',
    'glass',
    'synth',
    'pad',
    'chip',
    'wobble',
    'laser',
    'theremin',
    'drums',
    'tr808',
    'latin',
  ];
  let k = 0;
  window.__soak = setInterval(() => {
    k++;
    if (k % 40 === 0)
      v.store.getState().set({
        instrument: ids[Math.floor(Math.random() * ids.length)],
        quantize: ['off', '1/8', '1/16'][k % 3],
      });
    const i = [1, 2, 3, 4, 6, 7, 8, 9][Math.floor(Math.random() * 8)];
    v.session.fingerOn(i, Math.random(), Math.floor(Math.random() * 5) - 2);
    v.session.fingerContinuous(i, Math.random(), 0);
    setTimeout(
      () => {
        v.session.fingerOff(i);
        v.session.fingerContinuous(i, 0, 0);
      },
      80 + Math.random() * 600,
    );
    if (k % 7 === 0) {
      const m = 48 + Math.floor(Math.random() * 36);
      v.session.pianoDown(m);
      setTimeout(() => v.session.pianoUp(m), 200);
    }
    if (k % 5 === 0) v.session.padDown(Math.floor(Math.random() * 8));
    if (k % 600 === 0) {
      v.session.loopClear();
      v.store.getState().set({ loopBars: 1 });
      v.session.loopRecord();
    }
  }, 60);
});
const sample = async (label) => {
  const r = await p.evaluate(() => {
    if (typeof window.gc === 'function') window.gc();
    const v = window.__vsc;
    return {
      heapMB: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1),
      voices: v.audio.activeVoices,
      notes: v.live.notes.size,
      intervals: window.__intervals.size,
      loop: v.session.looper.eventCount,
    };
  });
  console.log(label, JSON.stringify(r));
};
for (let m = 0; m <= MIN * 2; m++) {
  await sample(`t=${(m / 2).toFixed(1)}min`);
  if (m < MIN * 2) await p.waitForTimeout(30000);
}
await p.evaluate(() => {
  clearInterval(window.__soak);
  window.__vsc.session.loopClear();
  window.__vsc.store.getState().set({ instrument: 'piano' });
});
await p.waitForTimeout(8000);
await sample('parado 8s depois');
console.log('pageerrors', errs);
await b.close();
