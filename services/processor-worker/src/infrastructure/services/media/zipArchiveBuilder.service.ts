import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import type { ArchiveBuilder } from '../../../application/interfaces/services/archiveBuilder.service.js';
import { ProcessingError } from '../../../domain/errors/processingError.js';

/** Zip with store method only — PNGs are already compressed. */
export const createZipArchiveBuilder = (): ArchiveBuilder => ({
  createZip: async (framePaths, framesPackagePath) => {
    await new Promise<void>((resolve, reject) => {
      const packageStream = createWriteStream(framesPackagePath);
      const archive = archiver('zip', { zlib: { level: 0 }, store: true });

      packageStream.on('close', () => {
        resolve();
      });
      packageStream.on('error', (error) => {
        reject(new ProcessingError(true, 'ZIP_WRITE_FAILED', 'failed writing zip', error));
      });
      archive.on('error', (error) => {
        reject(new ProcessingError(true, 'ZIP_BUILD_FAILED', 'failed building zip', error));
      });

      archive.pipe(packageStream);
      for (const framePath of framePaths) {
        archive.file(framePath, { name: path.basename(framePath) });
      }
      void archive.finalize();
    });
  },
});
