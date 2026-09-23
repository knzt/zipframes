import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createFsWorkDirectory } from '../../src/infrastructure/services/filesystem/fsWorkDirectory.service.js';
import { createZipArchiveBuilder } from '../../src/infrastructure/services/media/zipArchiveBuilder.service.js';

describe('fs work directory', () => {
  it('creates and removes a temp directory', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-work-'));
    const work = createFsWorkDirectory(base);
    const dir = await work.createTempDir('job');
    await access(dir);
    await work.removeDir(dir);
    await expect(access(dir)).rejects.toThrow();
  });
});

describe('zip archive builder', () => {
  it('writes a zip with store compression', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-zip-'));
    const filePath = path.join(base, 'frame_0001.png');
    const zipPath = path.join(base, 'frames.zip');
    await writeFile(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await createZipArchiveBuilder().createZip([filePath], zipPath);
    await access(zipPath);
  });

  it('fails when the zip output path or a source file is unusable', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'zf-zip-'));
    const blocker = path.join(base, 'not-a-directory');
    await writeFile(blocker, 'x');
    const builder = createZipArchiveBuilder();

    await expect(builder.createZip([blocker], path.join(blocker, 'out.zip'))).rejects.toMatchObject(
      {
        retryable: true,
        code: 'ZIP_WRITE_FAILED',
      },
    );
  });
});
