export {
  User,
  brandUserId,
  type UserId,
  type RegisterUserProps,
  type PersistedUser,
} from './entities/user.js';

// `Password` is not re-exported here: it comes from
// @zipframes/value-objects, the single source of the system's value
// objects, and whoever needs it imports it from there.
export type { PasswordHash } from './valueObjects/passwordHash.js';
export { asPasswordHash } from './valueObjects/passwordHash.js';

export type { UserRegistered } from './events/userRegistered.js';
export { userRegisteredFrom } from './events/userRegistered.js';

export type { UserError } from './errors/userErrors.js';
