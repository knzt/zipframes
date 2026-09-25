import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.unit.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main/**',
        'src/application/interfaces/**',
        'src/application/**/*.types.ts',
        'src/domain/index.ts',
        'src/domain/valueObjects/**',
        'src/infrastructure/gateways/storage/**',
        'src/infrastructure/messaging/rabbitmqConnection.ts',
        'src/infrastructure/services/**',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
