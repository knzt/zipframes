export interface StoredObject {
  readonly sizeBytes: number;
}

export interface ObjectStorage {
  /** What the storage holds at `key`, or `null` when nothing was uploaded there. */
  readonly head: (key: string) => Promise<StoredObject | null>;
  /** Idempotent: deleting a key that holds nothing succeeds. */
  readonly deleteObject: (key: string) => Promise<void>;
}
