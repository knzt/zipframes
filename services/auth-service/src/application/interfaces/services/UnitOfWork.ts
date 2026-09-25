/**
 * Bounds a set of writes so they commit together or not at all. The use
 * case decides the boundary; the Prisma adapter runs `prisma.$transaction`
 * with a shared client.
 */
export interface UnitOfWork {
  readonly run: <T>(work: () => Promise<T>) => Promise<T>;
}
