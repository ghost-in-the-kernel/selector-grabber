import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure functions only. Anything that evaluates XPath runs in real Chromium via Playwright,
    // because jsdom's XPath implementation fails on expressions the engine emits.
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
  },
});
