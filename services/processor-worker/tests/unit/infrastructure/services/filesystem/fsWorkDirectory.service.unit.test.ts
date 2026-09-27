import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FsWorkDirectory } from '../../../../../src/infrastructure/services/filesystem/fsWorkDirectory.service.js';

describe('FsWorkDirectory', () => {
  it('creates a prefixed temp directory and removes it', async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), 'work-dir-'));
    const work = new FsWorkDirectory(baseDir);
    try {
      const dir = await work.createTempDir('video-1');
      expect(dir.startsWith(path.join(baseDir, 'video-1-'))).toBe(true);
      await access(dir);
      await work.removeDir(dir);
      await expect(access(dir)).rejects.toThrow();
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
