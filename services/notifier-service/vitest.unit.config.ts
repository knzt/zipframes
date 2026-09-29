import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.unit.test.ts'],
    coverage: {
      provider: 'v8',
      // lcov is what the Sonar scanner reads; text keeps the local summary.
      reporter: ['text', 'lcov'],
      include: [
        'src/domain/**',
        'src/application/**',
        'src/interface-adapters/**',
        'src/infrastructure/gateways/**',
        'src/infrastructure/messaging/amqplib/amqpSettle.ts',
        'src/infrastructure/messaging/amqplib/amqpTopology.ts',
        'src/infrastructure/observability/**',
        'src/infrastructure/loadEnvConfig.ts',
      ],
      exclude: ['src/application/interfaces/**', 'src/domain/index.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
