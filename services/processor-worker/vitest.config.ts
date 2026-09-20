import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/domain/**/*.ts', 'src/application/**/*.ts'],
      exclude: [],
      thresholds: {
        statements: 80,
        branches: 50,
        functions: 80,
        lines: 80,
      },
    },
  },
});
