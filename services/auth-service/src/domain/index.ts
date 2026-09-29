// `Password` is not re-exported here: it comes from
// @zipframes/value-objects, the single source of the system's value
// objects, and whoever needs it imports it from there. `PasswordHash` is
// not a value object, so it lives with the aggregate that owns it.
export {
  User,
  brandUserId,
  asPasswordHash,
  type UserId,
  type PasswordHash,
  type RegisterUserProps,
  type PersistedUser,
} from './entities/user.js';

export type { UserRegistered } from './events/userRegistered.js';
export { userRegisteredFrom } from './events/userRegistered.js';

export type { UserError } from './errors/userErrors.js';
