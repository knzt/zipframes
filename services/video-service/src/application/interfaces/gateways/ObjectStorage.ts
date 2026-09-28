import type { Readable } from 'node:stream';

export interface StoredObject {
  readonly sizeBytes: number;
}

export interface ObjectStorage {
  /** Streams `content` to `key` and reports how many bytes the storage received. */
  readonly upload: (key: string, content: Readable, contentType: string) => Promise<StoredObject>;
  /** Idempotent: deleting a key that holds nothing succeeds. */
  readonly deleteObject: (key: string) => Promise<void>;
}
