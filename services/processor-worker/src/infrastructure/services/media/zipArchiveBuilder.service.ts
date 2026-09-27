import { UnavailableError } from '@zipframes/core';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import type { ArchiveBuilder } from '../../../application/interfaces/services/ArchiveBuilder.js';

/** Zip with store method only — PNGs are already compressed. */
export class ZipArchiveBuilder implements ArchiveBuilder {
  async createZip(framePaths: readonly string[], framesPackagePath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const packageStream = createWriteStream(framesPackagePath);
      const archive = archiver('zip', { zlib: { level: 0 }, store: true });

      packageStream.on('close', () => {
        resolve();
      });
      packageStream.on('error', (error) => {
        reject(new UnavailableError('ZIP_WRITE_FAILED', 'failed writing zip', { cause: error }));
      });
      archive.on('error', (error) => {
        reject(new UnavailableError('ZIP_BUILD_FAILED', 'failed building zip', { cause: error }));
      });

      archive.pipe(packageStream);
      for (const framePath of framePaths) {
        archive.file(framePath, { name: path.basename(framePath) });
      }
      void archive.finalize();
    });
  }
}
