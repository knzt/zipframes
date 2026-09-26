import { SystemClock } from '../../../infrastructure/services/systemClock.js';

export const createClock = (): SystemClock => new SystemClock();
