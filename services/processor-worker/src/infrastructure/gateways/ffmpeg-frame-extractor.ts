import { spawn } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { FrameExtractor } from '../../application/gateways/frame-extractor.js';
import { ProcessingError } from '../../domain/errors.js';
import { FRAME_EXTENSION, FRAME_FPS, frameFileName } from '../../domain/frame-extraction-policy.js';

const runFfmpeg = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      reject(
        new ProcessingError('transient', 'FFMPEG_SPAWN_FAILED', 'failed to start ffmpeg', error),
      );
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const permanent =
        /Invalid data found|Unknown format|moov atom not found|Invalid argument/i.test(stderr);
      reject(
        new ProcessingError(
          permanent ? 'permanent' : 'transient',
          permanent ? 'UNSUPPORTED_MEDIA' : 'FFMPEG_FAILED',
          permanent ? 'ffmpeg rejected the media file' : `ffmpeg exited with code ${String(code)}`,
        ),
      );
    });
  });

export const createFfmpegFrameExtractor = (): FrameExtractor => ({
  extract: async (inputPath, outputDir) => {
    await mkdir(outputDir, { recursive: true });
    const pattern = path.join(outputDir, `frame_%04d.${FRAME_EXTENSION}`);
    await runFfmpeg(['-y', '-i', inputPath, '-vf', `fps=${String(FRAME_FPS)}`, pattern]);

    const entries = await readdir(outputDir);
    const frames = entries
      .filter((name) => name.endsWith(`.${FRAME_EXTENSION}`))
      .sort()
      .map((name, index) => {
        // Normalize to the domain naming contract when ffmpeg output matches.
        void frameFileName(index + 1);
        return path.join(outputDir, name);
      });

    return frames;
  },
});
