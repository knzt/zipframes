export interface ArchiveBuilder {
  readonly createZip: (framePaths: readonly string[], framesPackagePath: string) => Promise<void>;
}
