export interface ObjectStorage {
  readonly downloadToFile: (key: string, destinationPath: string) => Promise<void>;
  readonly uploadFile: (key: string, sourcePath: string, contentType: string) => Promise<void>;
  readonly deleteObject: (key: string) => Promise<void>;
}
