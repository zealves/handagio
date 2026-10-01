import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    permissions: ['camera'],
    // a app segue a língua do navegador: os testes correm em português (o inglês tem os seus)
    locale: 'pt-PT',
    // Chromium completo (headless novo) com GPU: no headless-shell o WebGL é por software e a
    // deteção bloqueia a thread principal durante centenas de ms.
    channel: 'chromium',
    launchOptions: {
      args: [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
