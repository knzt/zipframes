import type { Clock } from '../../application/interfaces/services/Clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
