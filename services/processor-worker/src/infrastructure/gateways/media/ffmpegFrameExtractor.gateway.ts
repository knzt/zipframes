import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readdir, rename } from 'node:fs/promises';
import path from 'node:path';

import type { FrameExtractor } from '../../../application/ports/gateways/frameExtractor.gateway.js';
import { ProcessingError } from '../../../domain/errors/processingError.js';
import {
  FRAME_EXTENSION,
  FRAME_FPS,
  frameFileName,
} from '../../../domain/policies/frameExtractionPolicy.js';

const PERMANENT_STDERR =
  /Invalid data found|Unknown format|moov atom not found|Invalid argument|Protocol not found/i;

/** Exported for unit tests of permanent vs transient classification. */
export const classifyFfmpegFailure = (code: number | null, stderr: string): ProcessingError => {
  const permanent = PERMANENT_STDERR.test(stderr);
  return new ProcessingError(
    !permanent,
    permanent ? 'UNSUPPORTED_MEDIA' : 'FFMPEG_FAILED',
    permanent
      ? 'ffmpeg rejected the media file'
      : `ffmpeg exited with code ${String(code ?? 'unknown')}`,
  );
};

const runFfmpeg = (args: string[], signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProcessingError(true, 'PROCESSING_TIMEOUT', 'ffmpeg cancelled before start'));
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
      reject(new ProcessingError(true, 'FFMPEG_SPAWN_FAILED', 'failed to start ffmpeg', error));
    });
    child.on('close', (code, killSignal) => {
      if (settled) {
        return;
      }
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted || killSignal === 'SIGKILL') {
        reject(new ProcessingError(true, 'PROCESSING_TIMEOUT', 'ffmpeg killed by timeout'));
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
  extract: async (originalVideoPath, framesDirectory, signal) => {
    await mkdir(framesDirectory, { recursive: true });
    const pattern = path.join(framesDirectory, `frame_%04d.${FRAME_EXTENSION}`);
    await runFfmpeg(
      ['-y', '-i', originalVideoPath, '-vf', `fps=${String(FRAME_FPS)}`, pattern],
      signal,
    );

    const produced = (await readdir(framesDirectory))
      .filter((name) => name.endsWith(`.${FRAME_EXTENSION}`))
      .sort();

    const framePaths: string[] = [];
    for (const [index, producedName] of produced.entries()) {
      const canonicalName = frameFileName(index + 1);
      const producedPath = path.join(framesDirectory, producedName);
      const canonicalPath = path.join(framesDirectory, canonicalName);
      if (producedName !== canonicalName) {
        await rename(producedPath, canonicalPath);
      }
      framePaths.push(canonicalPath);
    }

    return framePaths;
  },
});
