// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include:     ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include:  ['lib/scoring/**', 'lib/intelligence/**', 'lib/geo/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
