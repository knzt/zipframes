import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Adapters that touch a real dependency (Postgres, the broker) need
      // Testcontainers to test meaningfully, which CI runs but this project
      // does not require locally; they are covered by integration tests,
      // not this unit gate. Crypto adapters have no such dependency — real
      // bcrypt and real RS256 signing run in their tests — so they hold
      // the same bar as domain and application.
      include: [
        'src/domain/**',
        'src/application/**',
        'src/adapters/crypto/**',
        'src/adapters/messaging/outbox-envelope.ts',
        'src/adapters/http/**',
        'src/main/config.ts',
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
