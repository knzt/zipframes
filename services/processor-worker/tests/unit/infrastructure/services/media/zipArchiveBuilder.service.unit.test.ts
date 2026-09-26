import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createZipArchiveBuilder } from '../../../../../src/infrastructure/services/media/zipArchiveBuilder.service.js';

describe('createZipArchiveBuilder', () => {
  it('writes a zip with the frame file names', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'zip-builder-'));
    try {
      const frame = path.join(dir, 'frame_0001.png');
      const archivePath = path.join(dir, 'frames.zip');
      await writeFile(frame, 'png');

      await createZipArchiveBuilder().createZip([frame], archivePath);

      const zip = await readFile(archivePath);
      expect(zip.subarray(0, 2).toString()).toBe('PK');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
