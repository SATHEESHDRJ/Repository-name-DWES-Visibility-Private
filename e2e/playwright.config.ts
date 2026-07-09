import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: process.env.DWES_E2E_BASE_URL || 'http://localhost:5175',
    headless: true,
  },
});
