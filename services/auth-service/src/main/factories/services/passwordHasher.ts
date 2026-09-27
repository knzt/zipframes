import { BcryptPasswordHasher } from '../../../infrastructure/services/crypto/bcryptPasswordHasher.js';

export const createPasswordHasher = (): BcryptPasswordHasher => new BcryptPasswordHasher();
