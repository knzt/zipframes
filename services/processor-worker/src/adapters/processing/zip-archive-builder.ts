import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import type { ArchiveBuilder } from '../../application/ports/archive-builder.js';
import { ProcessingError } from '../../domain/errors.js';

/** Zip with store method only — PNGs are already compressed. */
export const createZipArchiveBuilder = (): ArchiveBuilder => ({
  createZip: async (filePaths, outputPath) => {
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 0 }, store: true });

      output.on('close', () => {
        resolve();
      });
      output.on('error', (error) => {
        reject(new ProcessingError('transient', 'ZIP_WRITE_FAILED', 'failed writing zip', error));
      });
      archive.on('error', (error) => {
        reject(new ProcessingError('transient', 'ZIP_BUILD_FAILED', 'failed building zip', error));
      });

      archive.pipe(output);
      for (const filePath of filePaths) {
        archive.file(filePath, { name: path.basename(filePath) });
      }
      void archive.finalize();
    });
  },
});
