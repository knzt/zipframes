import type { Authenticator } from '@zipframes/authenticator';

import { DeleteAccountController } from '../../../interface-adapters/DeleteAccountController.js';
import {
  createDeleteAccountUseCase,
  type DeleteAccountExternalDeps,
} from '../use-cases/deleteAccountUseCase.js';

export interface DeleteAccountControllerExternalDeps extends DeleteAccountExternalDeps {
  readonly authenticator: Authenticator;
}

export const createDeleteAccountController = (
  externalDeps: DeleteAccountControllerExternalDeps,
): DeleteAccountController =>
  new DeleteAccountController(createDeleteAccountUseCase(externalDeps), externalDeps.authenticator);
