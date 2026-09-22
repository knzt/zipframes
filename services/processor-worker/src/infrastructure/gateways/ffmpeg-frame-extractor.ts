import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

import type { FrameExtractor } from '../../application/gateways/frame-extractor.js';
import { ProcessingError } from '../../domain/errors.js';
import { FRAME_EXTENSION, FRAME_FPS, frameFileName } from '../../domain/frame-extraction-policy.js';

const PERMANENT_STDERR =
  /Invalid data found|Unknown format|moov atom not found|Invalid argument|Protocol not found/i;

/** Exported for unit tests of permanent vs transient classification. */
export const classifyFfmpegFailure = (code: number | null, stderr: string): ProcessingError => {
  const permanent = PERMANENT_STDERR.test(stderr);
  return new ProcessingError(
    permanent ? 'permanent' : 'transient',
    permanent ? 'UNSUPPORTED_MEDIA' : 'FFMPEG_FAILED',
    permanent
      ? 'ffmpeg rejected the media file'
      : `ffmpeg exited with code ${String(code ?? 'unknown')}`,
  );
};

const runFfmpeg = (args: string[], signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'ffmpeg cancelled before start'),
      );
      return;
    }

    const child: ChildProcess = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const onAbort = (): void => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      reject(
        new ProcessingError('transient', 'FFMPEG_SPAWN_FAILED', 'failed to start ffmpeg', error),
      );
    });
    child.on('close', (code, killSignal) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted || killSignal === 'SIGKILL') {
        reject(new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'ffmpeg killed by timeout'));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(classifyFfmpegFailure(code, stderr));
    });
  });

export const createFfmpegFrameExtractor = (): FrameExtractor => ({
  extract: async (inputPath, outputDir, signal) => {
    await mkdir(outputDir, { recursive: true });
    const pattern = path.join(outputDir, `frame_%04d.${FRAME_EXTENSION}`);
    await runFfmpeg(['-y', '-i', inputPath, '-vf', `fps=${String(FRAME_FPS)}`, pattern], signal);

    const entries = (await readdir(outputDir))
      .filter((name) => name.endsWith(`.${FRAME_EXTENSION}`))
      .sort();

    const frames: string[] = [];
    for (const [index, name] of entries.entries()) {
      const expected = frameFileName(index + 1);
      const source = path.join(outputDir, name);
      const destination = path.join(outputDir, expected);
      if (name !== expected) {
        await rename(source, destination);
      }
      frames.push(destination);
    }

    return frames;
  },
});
