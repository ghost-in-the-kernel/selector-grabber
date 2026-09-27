import { defineConfig } from '@playwright/test';

export default defineConfig({
  timeout: 30_000,
  // One retry on CI: browser-driven tests occasionally hit timing noise on shared runners.
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  projects: [
    // The locator engine runs inside real Chromium: its XPath support is what users get.
    { name: 'engine', testDir: 'test/engine', use: { browserName: 'chromium', headless: true } },
    // The built extension (dist-e2e/) loaded into Chromium; see test/e2e/extension.spec.ts.
    { name: 'e2e', testDir: 'test/e2e' },
  ],
});
