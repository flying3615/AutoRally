import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
});
