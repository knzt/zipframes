import { FsWorkDirectory } from '../../../infrastructure/services/filesystem/fsWorkDirectory.service.js';

export const createWorkDirectory = (baseDir: string): FsWorkDirectory =>
  new FsWorkDirectory(baseDir);
