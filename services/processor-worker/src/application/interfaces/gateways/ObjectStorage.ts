export interface ObjectStorage {
  readonly downloadToFile: (
    key: string,
    destinationPath: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly uploadFile: (
    key: string,
    sourcePath: string,
    contentType: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly deleteObject: (key: string) => Promise<void>;
}
