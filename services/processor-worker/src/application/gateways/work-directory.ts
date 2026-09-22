export interface WorkDirectory {
  readonly createTempDir: (prefix: string) => Promise<string>;
  readonly removeDir: (path: string) => Promise<void>;
}
