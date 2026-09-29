// Gera icon-192.png e icon-512.png a partir de public/icon.svg (usa o Chromium do Playwright).
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(
    `<style>html,body{margin:0;background:#0b1020}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  );
  await p.screenshot({ path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname });
  await p.close();
}
await b.close();
console.log('Ícones gerados.');
