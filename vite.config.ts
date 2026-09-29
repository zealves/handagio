/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Ficheiros do MediaPipe pré-carregados pelo service worker (variante SIMD do WASM). */
const MEDIAPIPE = [
  'mediapipe/hand_landmarker.task',
  'mediapipe/face_landmarker.task',
  'mediapipe/wasm/vision_wasm_internal.js',
  'mediapipe/wasm/vision_wasm_internal.wasm',
];

/** Gera dist/sw.js com a lista de ficheiros do build, para a app funcionar sem internet. */
function serviceWorker(): Plugin {
  return {
    name: 'vsc-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const statics = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
      const precache = ['./', 'index.html', ...statics, ...MEDIAPIPE, ...files];
      const sizes = MEDIAPIPE.map((f) => {
        try {
          return statSync(`public/${f}`).size;
        } catch {
          return 0;
        }
      });
      const version = createHash('sha1')
        .update(precache.join('|') + sizes.join(','))
        .digest('hex')
        .slice(0, 12);
      const tpl = readFileSync('scripts/sw.template.js', 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: tpl
          .replace('__VERSION__', version)
          .replace('__PRECACHE__', JSON.stringify(precache, null, 2)),
      });
    },
  };
}

// base relativo para funcionar em GitHub Pages (subpasta) e em Vercel/Netlify.
export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
