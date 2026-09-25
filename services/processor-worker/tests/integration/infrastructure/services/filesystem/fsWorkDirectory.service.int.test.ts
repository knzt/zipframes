import { mkdtemp, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { createFsWorkDirectory } from '../../../../../src/infrastructure/services/filesystem/fsWorkDirectory.service.js';

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
