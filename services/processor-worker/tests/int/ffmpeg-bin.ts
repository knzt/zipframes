import { createRequire } from 'node:module';
import { delimiter, dirname } from 'node:path';

const require = createRequire(import.meta.url);

/** Puts the bundled ffmpeg binary on PATH so spawn('ffmpeg') resolves it. */
export const useBundledFfmpeg = (): string => {
  const ffmpegPath: unknown = require('ffmpeg-static');
  if (typeof ffmpegPath !== 'string' || ffmpegPath.length === 0) {
    throw new Error('ffmpeg-static did not provide a binary for this platform');
  }
  const directory = dirname(ffmpegPath);
  process.env.PATH = `${directory}${delimiter}${process.env.PATH ?? ''}`;
  return ffmpegPath;
};
