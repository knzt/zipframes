export interface FrameExtractor {
  readonly extract: (
    originalVideoPath: string,
    framesDirectory: string,
    signal?: AbortSignal,
  ) => Promise<readonly string[]>;
}
