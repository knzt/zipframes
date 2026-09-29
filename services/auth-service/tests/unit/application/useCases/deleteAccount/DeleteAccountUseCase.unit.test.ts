import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DeleteAccountUseCase } from '../../../../../src/application/useCases/deleteAccount/DeleteAccountUseCase.js';
import { User } from '../../../../../src/domain/entities/user.js';
import { InMemoryEventPublisher, InMemoryUserRepository } from '../../../../support/in-memory.js';

const CORRELATION_ID = '0194f3a0-0000-7000-8000-000000000099';

let userRepository: InMemoryUserRepository;
let eventPublisher: InMemoryEventPublisher;
let onPublishFailed: ReturnType<typeof vi.fn>;
let deleteAccount: DeleteAccountUseCase;

beforeEach(() => {
  userRepository = new InMemoryUserRepository();
  eventPublisher = new InMemoryEventPublisher();
  onPublishFailed = vi.fn();
  deleteAccount = new DeleteAccountUseCase(userRepository, eventPublisher, onPublishFailed);
});

const aStoredUser = async (): Promise<User> => {
  const created = User.create({ name: 'Ada Lovelace', email: 'ada@example.com', now: new Date() });
  if (!created.ok) throw new Error('expected creation to succeed');
  const user = created.value.attachPasswordHash('hashed:secret');
  await userRepository.create(user);
  return user;
};

describe('DeleteAccountUseCase', () => {
  it('removes the row and publishes user.deleted', async () => {
    const user = await aStoredUser();

    const result = await deleteAccount.execute({ userId: user.id, correlationId: CORRELATION_ID });

    expect(result).toEqual({ ok: true, value: undefined });
    expect(userRepository.users.size).toBe(0);
    expect(eventPublisher.published).toEqual([
      { eventType: 'user.deleted', correlationId: CORRELATION_ID, payload: { userId: user.id } },
    ]);
  });

  it('succeeds even for an id that is already gone', async () => {
    const result = await deleteAccount.execute({
      userId: '0194f3a0-0000-7000-8000-0000000000aa',
      correlationId: CORRELATION_ID,
    });

    expect(result.ok).toBe(true);
    expect(eventPublisher.published).toHaveLength(1);
  });

  it('still deletes the account and reports the failure when publish fails', async () => {
    const user = await aStoredUser();
    eventPublisher.failWith = new Error('broker down');

    const result = await deleteAccount.execute({ userId: user.id, correlationId: CORRELATION_ID });

    expect(result.ok).toBe(true);
    expect(userRepository.users.size).toBe(0);
    expect(onPublishFailed).toHaveBeenCalledWith(eventPublisher.failWith, {
      userId: user.id,
      correlationId: CORRELATION_ID,
    });
  });

  it('still succeeds when publish fails and no failure handler is provided', async () => {
    const user = await aStoredUser();
    const publisher = new InMemoryEventPublisher();
    publisher.failWith = new Error('broker down');
    const useCase = new DeleteAccountUseCase(userRepository, publisher);

    const result = await useCase.execute({ userId: user.id, correlationId: CORRELATION_ID });

    expect(result.ok).toBe(true);
  });
});
