import { beforeEach, describe, expect, it } from 'vitest';

import { DeleteAccountUseCase } from '../../../src/application/useCases/deleteAccount/DeleteAccountUseCase.js';
import { User } from '../../../src/domain/entities/user.js';
import { DeleteAccountController } from '../../../src/interface-adapters/DeleteAccountController.js';
import { bearerFor, fakeAuthenticator } from '../../support/fake-authenticator.js';
import { InMemoryEventPublisher, InMemoryUserRepository } from '../../support/in-memory.js';

const CORRELATION_ID = '0194f3a0-0000-7000-8000-000000000099';

let userRepository: InMemoryUserRepository;
let eventPublisher: InMemoryEventPublisher;
let controller: DeleteAccountController;

beforeEach(() => {
  userRepository = new InMemoryUserRepository();
  eventPublisher = new InMemoryEventPublisher();
  controller = new DeleteAccountController(
    new DeleteAccountUseCase(userRepository, eventPublisher),
    fakeAuthenticator,
  );
});

const aStoredUser = async (): Promise<User> => {
  const created = User.create({ name: 'Ada Lovelace', email: 'ada@example.com', now: new Date() });
  if (!created.ok) throw new Error('expected creation to succeed');
  const user = created.value.attachPasswordHash('hashed:secret');
  await userRepository.create(user);
  return user;
};

describe('DeleteAccountController', () => {
  it('deletes the caller of the token, and no one else', async () => {
    const user = await aStoredUser();

    const reply = await controller.handle({
      body: undefined,
      correlationId: CORRELATION_ID,
      authorization: bearerFor(user.id),
    });

    expect(reply).toEqual({ status: 204, body: undefined });
    expect(userRepository.users.size).toBe(0);
    expect(eventPublisher.published).toEqual([
      { eventType: 'user.deleted', correlationId: CORRELATION_ID, payload: { userId: user.id } },
    ]);
  });

  it('answers 401 without a valid token, and deletes no one', async () => {
    await aStoredUser();

    const reply = await controller.handle({ body: undefined, correlationId: CORRELATION_ID });

    expect(reply.status).toBe(401);
    expect(userRepository.users.size).toBe(1);
  });
});
