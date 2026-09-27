export {
  User,
  brandUserId,
  type UserId,
  type RegisterUserProps,
  type PersistedUser,
} from './entities/user.js';

export type { Password, PasswordHash } from './valueObjects/password.js';
export { createPassword, asPasswordHash } from './valueObjects/password.js';

export type { UserRegistered } from './events/userRegistered.js';
export { userRegisteredFrom } from './events/userRegistered.js';

export type { UserError, PasswordError } from './errors/userErrors.js';
