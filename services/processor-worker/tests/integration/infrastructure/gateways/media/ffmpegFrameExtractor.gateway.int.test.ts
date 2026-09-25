import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { frameFileName } from '../../../../../src/domain/policies/frameExtractionPolicy.js';
import { createFfmpegFrameExtractor } from '../../../../../src/infrastructure/gateways/media/ffmpegFrameExtractor.gateway.js';
import { useBundledFfmpeg } from '../../../../support/ffmpeg-bin.js';

const renderClip = (destination: string, durationSeconds: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc=duration=${String(durationSeconds)}:size=64x64:rate=1`,
      '-pix_fmt',
      'yuv420p',
      destination,
    ]);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${String(code)}`));
    });
  });

describe('ffmpeg frame extractor', () => {
  beforeAll(() => {
    useBundledFfmpeg();
  });

  it('writes frame_0001.png from a real clip', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-ff-'));
    const video = path.join(base, 'clip.mp4');
    const frames = path.join(base, 'frames');
    await renderClip(video, 1);

    const extracted = await createFfmpegFrameExtractor().extract(video, frames);

    expect(extracted).toHaveLength(1);
    expect(path.basename(extracted[0] ?? '')).toBe(frameFileName(1));
  });

  it('rejects a file ffmpeg cannot decode', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-ff-bad-'));
    const video = path.join(base, 'clip.mp4');
    await writeFile(video, Buffer.from('this is not a media file'));

    await expect(
      createFfmpegFrameExtractor().extract(video, path.join(base, 'frames')),
    ).rejects.toMatchObject({ retryable: false, code: 'UNSUPPORTED_MEDIA' });
  });

  it('kills ffmpeg when the caller aborts', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-ff-abort-'));
    const video = path.join(base, 'clip.mp4');
    await renderClip(video, 30);
    const controller = new AbortController();
    const pending = createFfmpegFrameExtractor().extract(
      video,
      path.join(base, 'frames'),
      controller.signal,
    );
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
  });

  it('fails before start when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      createFfmpegFrameExtractor().extract('unused.mp4', 'unused-frames', controller.signal),
    ).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
  });
});
