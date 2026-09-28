import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.int.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
