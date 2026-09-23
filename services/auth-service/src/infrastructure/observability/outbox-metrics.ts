import { Counter, type Registry } from 'prom-client';

export interface OutboxMetrics {
  readonly recordExhausted: () => void;
}

export const createOutboxMetrics = (registry: Registry): OutboxMetrics => {
  const exhausted = new Counter({
    name: 'outbox_exhausted_total',
    help: 'Outbox rows that stopped being published after reaching the attempt limit',
    registers: [registry],
  });

  return {
    recordExhausted: () => {
      exhausted.inc();
    },
  };
};
