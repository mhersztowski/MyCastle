import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for the CAD app (cad-backend :1897 + cad-app :1898).
 * Separate from the main config because cad-app is a standalone editor
 * (no auth, no PIM backend) with its own dev servers. Exercises the packages
 * @mhersztowski/core-cad, core-cad-viewer, core-scene3d, ui-components-scene3d.
 */
export default defineConfig({
  testDir: './tests/e2e-cad',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'line',
  // cad-app is a large (Three.js + Leaflet + Monaco) bundle; a cold Vite dev
  // transform on the first request from a fresh browser can take a while.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:1898',
    trace: 'on-first-retry',
    navigationTimeout: 60_000,
    screenshot: 'only-on-failure',
    // cad-app mounts Three.js / react-three-fiber (Scene 3D, CAD 3D) which needs
    // a WebGL context. Headless Chromium has none by default, so enable software
    // (SwiftShader) rendering — otherwise the app crashes to a blank page.
    launchOptions: {
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm dev:cad',
      url: 'http://localhost:1898',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
