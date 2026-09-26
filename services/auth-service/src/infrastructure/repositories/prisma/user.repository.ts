import type { PrismaClient } from '@prisma/client';

import type { UserRepository } from '../../../application/interfaces/repositories/UserRepository.js';
import { User } from '../../../domain/entities/user.js';

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({ where: { email } });
    return user === null ? null : User.fromPersistence(user);
  }

  async create(user: User): Promise<User> {
    const persisted = await this.prisma.user.create({ data: user.toJSON() });
    return User.fromPersistence(persisted);
  }
}
