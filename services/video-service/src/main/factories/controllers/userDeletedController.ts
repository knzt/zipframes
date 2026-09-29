import {
  UserDeletedController,
  type UserDeletedHandlerOptions,
} from '../../../interface-adapters/UserDeletedController.js';
import {
  createDeleteAccountVideosUseCase,
  type DeleteAccountVideosExternalDeps,
} from '../use-cases/deleteAccountVideosUseCase.js';

export interface UserDeletedControllerExternalDeps extends DeleteAccountVideosExternalDeps {
  readonly handlerOptions: UserDeletedHandlerOptions;
}

export const createUserDeletedController = (
  externalDeps: UserDeletedControllerExternalDeps,
): UserDeletedController =>
  new UserDeletedController(
    createDeleteAccountVideosUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
