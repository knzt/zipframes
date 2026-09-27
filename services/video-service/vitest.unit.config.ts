import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.unit.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/domain/**',
        'src/application/**',
        'src/interface-adapters/**',
        'src/infrastructure/gateways/**',
        'src/infrastructure/http/**',
        'src/infrastructure/messaging/amqplib/amqpSettle.ts',
        'src/infrastructure/messaging/amqplib/amqpTopology.ts',
        'src/infrastructure/observability/**',
        'src/infrastructure/scheduling/**',
        'src/infrastructure/loadEnvConfig.ts',
      ],
      // Interfaces compile to nothing; barrels only re-export.
      exclude: ['src/application/interfaces/**', 'src/domain/index.ts'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});
