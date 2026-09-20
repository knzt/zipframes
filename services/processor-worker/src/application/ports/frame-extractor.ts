export interface FrameExtractor {
  readonly extract: (inputPath: string, outputDir: string) => Promise<readonly string[]>;
}
