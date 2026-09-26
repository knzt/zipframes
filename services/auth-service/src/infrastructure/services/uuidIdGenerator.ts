import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '../../application/interfaces/services/IdGenerator.js';

export class UuidIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
