import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/application/**',
        'src/infrastructure/crypto/**',
        'src/infrastructure/messaging/outbox-envelope.ts',
        'src/infrastructure/http/**',
        'src/infrastructure/config.ts',
        'src/infrastructure/observability/**',
        'src/infrastructure/repositories/prisma/registration-correlation.ts',
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
