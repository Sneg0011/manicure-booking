import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
