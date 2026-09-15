import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    exclude: ['tests/browser/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: false,
    maxWorkers: 1,
    testTimeout: 10000,
  },
});
