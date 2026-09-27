import {
  ApplyProcessingEventController,
  type ApplyProcessingEventHandlerOptions,
} from '../../../interface-adapters/ApplyProcessingEventController.js';
import {
  createApplyProcessingEventUseCase,
  type ApplyProcessingEventExternalDeps,
} from '../use-cases/applyProcessingEventUseCase.js';

export interface ApplyProcessingEventControllerExternalDeps extends ApplyProcessingEventExternalDeps {
  readonly handlerOptions: ApplyProcessingEventHandlerOptions;
}

export const createApplyProcessingEventController = (
  externalDeps: ApplyProcessingEventControllerExternalDeps,
): ApplyProcessingEventController =>
  new ApplyProcessingEventController(
    createApplyProcessingEventUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
