import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run start:server',
      url: 'http://127.0.0.1:3334/api/health',
      reuseExistingServer: false,
      env: {
        ...process.env,
        SERVER_PORT: '3334',
        DATABASE_PATH: ':memory:',
        TICKET_PROVIDER: 'mock',
        PAYMENT_PROVIDER: 'mock',
        PUBLIC_APP_URL: 'http://127.0.0.1:4173',
        PUBLIC_API_URL: 'http://127.0.0.1:3334',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_API_MODE: 'live',
        VITE_API_BASE_URL: '/api',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3334',
      },
    },
  ],
})
