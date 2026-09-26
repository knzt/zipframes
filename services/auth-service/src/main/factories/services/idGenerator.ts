import { UuidIdGenerator } from '../../../infrastructure/services/uuidIdGenerator.js';

export const createIdGenerator = (): UuidIdGenerator => new UuidIdGenerator();
