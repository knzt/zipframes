import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { WorkDirectory } from '../../../application/interfaces/services/workDirectory.service.js';

export const createFsWorkDirectory = (baseDir: string): WorkDirectory => ({
  createTempDir: async (prefix) => {
    const dir = path.join(baseDir, `${prefix}-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    return dir;
  },
  removeDir: async (dirPath) => {
    await rm(dirPath, { recursive: true, force: true });
  },
});
