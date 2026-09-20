export interface ArchiveBuilder {
  readonly createZip: (filePaths: readonly string[], outputPath: string) => Promise<void>;
}
