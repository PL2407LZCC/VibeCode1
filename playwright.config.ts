import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const HOST = '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;
const DEFAULT_ADMIN_TOKEN = 'testing-admin-key';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  timeout: 60_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev --workspace client -- --host ${HOST} --port ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_API_URL: process.env.VITE_API_URL ?? 'http://127.0.0.1:3000',
      VITE_ADMIN_TOKEN: process.env.VITE_ADMIN_TOKEN ?? DEFAULT_ADMIN_TOKEN
    }
  }
});
