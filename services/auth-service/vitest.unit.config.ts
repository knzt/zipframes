import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.unit.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/services/crypto/**',
        'src/infrastructure/messaging/outboxEnvelope.ts',
        'src/infrastructure/http/**',
        'src/infrastructure/config.ts',
        'src/infrastructure/observability/**',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
