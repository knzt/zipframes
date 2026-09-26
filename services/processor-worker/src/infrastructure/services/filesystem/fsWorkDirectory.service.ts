import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type { WorkDirectory } from '../../../application/interfaces/services/WorkDirectory.js';

export class FsWorkDirectory implements WorkDirectory {
  constructor(private readonly baseDir: string) {}

  async createTempDir(prefix: string): Promise<string> {
    const dir = path.join(this.baseDir, `${prefix}-${randomUUID()}`);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async removeDir(dirPath: string): Promise<void> {
    await rm(dirPath, { recursive: true, force: true });
  }
}
