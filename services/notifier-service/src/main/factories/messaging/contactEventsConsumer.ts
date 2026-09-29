import { ContactEventsConsumer } from '../../../infrastructure/messaging/amqplib/contactEventsConsumer.js';
import { createUserDeletedController } from '../controllers/contacts/userDeletedController.js';
import { createUserRegisteredController } from '../controllers/contacts/userRegisteredController.js';
import { createUserUpdatedController } from '../controllers/contacts/userUpdatedController.js';
import type { NotificationControllerExternalDeps } from '../controllers/externalDeps.js';

export const createContactEventsConsumer = (
  externalDeps: NotificationControllerExternalDeps,
): ContactEventsConsumer =>
  new ContactEventsConsumer({
    userRegistered: createUserRegisteredController(externalDeps),
    userUpdated: createUserUpdatedController(externalDeps),
    userDeleted: createUserDeletedController(externalDeps),
  });
