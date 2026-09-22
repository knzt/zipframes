export interface FrameExtractor {
  readonly extract: (
    inputPath: string,
    outputDir: string,
    signal?: AbortSignal,
  ) => Promise<readonly string[]>;
}
