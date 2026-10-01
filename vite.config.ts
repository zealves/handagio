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

/** Instrumento por defeito: as amostras entram no pré-cache para o primeiro arranque sem rede. */
const DEFAULT_SAMPLED = 'piano';

/** Manifest das amostras e as notas do instrumento por defeito, lidas do manifest no build. */
function precachedSamples(): string[] {
  const manifest = JSON.parse(readFileSync('public/samples/manifest.json', 'utf8')) as {
    instruments: Record<string, { notes: Record<string, number> }>;
  };
  const notes = Object.keys(manifest.instruments[DEFAULT_SAMPLED].notes);
  return ['samples/manifest.json', ...notes.map((n) => `samples/${DEFAULT_SAMPLED}/${n}.mp3`)];
}

/** Chunks das línguas (src/i18n/locales/*.ts): ficam fora do pré-cache e só se pedem a usada. */
const LOCALE_RE = /\/src\/i18n\/locales\/([a-z]+)\.ts$/;
const localeOf = (c: { type: string; facadeModuleId?: string | null }): string | null =>
  c.type === 'chunk' ? (c.facadeModuleId?.match(LOCALE_RE)?.[1] ?? null) : null;
/** Língua mais provável na primeira visita: o seu chunk é pré-carregado pelo index.html. */
const PRELOAD_LANG = 'pt';

/**
 * Pré-carrega o chunk da língua mais provável (`modulepreload` no index.html), para o arranque
 * não esperar por mais uma ida à rede depois do JS principal.
 */
function preloadLocale(): Plugin {
  return {
    name: 'handagio-preload-locale',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunk = Object.values(ctx.bundle ?? {}).find((c) => localeOf(c) === PRELOAD_LANG);
        if (!chunk) return html;
        return html.replace(
          '</head>',
          `  <link rel="modulepreload" crossorigin href="./${chunk.fileName}">\n  </head>`,
        );
      },
    },
  };
}

/** Gera dist/sw.js com a lista de ficheiros do build, para a app funcionar sem internet. */
function serviceWorker(): Plugin {
  return {
    name: 'handagio-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      // as línguas não entram: cada uma fica guardada quando é pedida (ver o `fetch` do sw)
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && f !== 'index.html' && !localeOf(bundle[f]),
      );
      const statics = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
      const sampleFiles = precachedSamples();
      const precache = ['./', 'index.html', ...statics, ...MEDIAPIPE, ...sampleFiles, ...files];
      const sizes = MEDIAPIPE.map((f) => {
        try {
          return statSync(`public/${f}`).size;
        } catch {
          return 0;
        }
      });
      const hash = createHash('sha1').update(precache.join('|') + sizes.join(','));
      // as amostras pré-carregadas mudam sem mudar de nome: o conteúdo entra na versão
      for (const f of sampleFiles) hash.update(readFileSync(`public/${f}`));
      const version = hash.digest('hex').slice(0, 12);
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
  plugins: [react(), serviceWorker(), preloadLocale()],
  // CSS também para Safari 15: mantém os fallbacks de vh/cqw antes de dvh e unidades de contentor.
  build: { cssTarget: ['chrome111', 'edge111', 'firefox114', 'safari15'] },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
