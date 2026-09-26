import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { S3Client } from '@aws-sdk/client-s3';
import { InternalServerError, TimeoutError, UnavailableError } from '@zipframes/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createS3ObjectStorage } from '../../../../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';

const config = {
  endpoint: 'http://localhost:8333',
  region: 'us-east-1',
  accessKey: 'key',
  secretKey: 'secret',
  bucket: 'videos',
  forcePathStyle: true,
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 's3-storage-'));
  directories.push(dir);
  return dir;
};

describe('createS3ObjectStorage', () => {
  it('downloads an object body to a file', async () => {
    const send = vi.fn(async () => ({ Body: Readable.from(['hello']) }));
    const storage = createS3ObjectStorage(config, { send } as unknown as S3Client);
    const destination = path.join(await tempDir(), 'object.bin');

    await storage.downloadToFile('uploads/a', destination);

    expect(await readFile(destination, 'utf8')).toBe('hello');
    expect(send).toHaveBeenCalledOnce();
  });

  it('uploads a local file', async () => {
    const send = vi.fn(async () => ({}));
    const storage = createS3ObjectStorage(config, { send } as unknown as S3Client);
    const source = path.join(await tempDir(), 'frame.png');
    await writeFile(source, 'png');

    await storage.uploadFile('outputs/a.zip', source, 'application/zip');

    expect(send).toHaveBeenCalledOnce();
  });

  it('deletes an object and pings the bucket', async () => {
    const send = vi.fn(async () => ({}));
    const storage = createS3ObjectStorage(config, { send } as unknown as S3Client);

    await storage.deleteObject('uploads/a');
    await storage.ping();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('throws SOURCE_MISSING when the object has no body', async () => {
    const storage = createS3ObjectStorage(config, {
      send: async () => ({}),
    } as unknown as S3Client);

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toMatchObject({ code: 'SOURCE_MISSING' });
  });

  it('maps NoSuchKey to SOURCE_MISSING', async () => {
    const storage = createS3ObjectStorage(config, {
      send: async () => {
        const error = new Error('missing');
        error.name = 'NoSuchKey';
        throw error;
      },
    } as unknown as S3Client);

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('maps a generic download failure to STORAGE_DOWNLOAD_FAILED', async () => {
    const storage = createS3ObjectStorage(config, {
      send: async () => {
        throw new Error('timeout');
      },
    } as unknown as S3Client);

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'failed.bin')),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('aborts a download that is already cancelled', async () => {
    const storage = createS3ObjectStorage(config, { send: vi.fn() } as unknown as S3Client);
    const signal = AbortSignal.abort();

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'cancelled.bin'), signal),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts a download that is cancelled while sending', async () => {
    const controller = new AbortController();
    const storage = createS3ObjectStorage(config, {
      send: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    } as unknown as S3Client);

    await expect(
      storage.downloadToFile(
        'uploads/a',
        path.join(await tempDir(), 'cancelled.bin'),
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts an upload that is already cancelled', async () => {
    const storage = createS3ObjectStorage(config, { send: vi.fn() } as unknown as S3Client);
    const source = path.join(await tempDir(), 'frame.png');
    await writeFile(source, 'png');

    await expect(
      storage.uploadFile('outputs/a.zip', source, 'application/zip', AbortSignal.abort()),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('maps upload failures and aborted uploads', async () => {
    const controller = new AbortController();
    const failing = createS3ObjectStorage(config, {
      send: async () => {
        throw new Error('slow');
      },
    } as unknown as S3Client);
    const aborted = createS3ObjectStorage(config, {
      send: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    } as unknown as S3Client);
    const source = path.join(await tempDir(), 'frame.png');
    await writeFile(source, 'png');

    await expect(
      failing.uploadFile('outputs/a.zip', source, 'application/zip'),
    ).rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED' });
    await expect(
      aborted.uploadFile('outputs/a.zip', source, 'application/zip', controller.signal),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('maps delete failures', async () => {
    const storage = createS3ObjectStorage(config, {
      send: async () => {
        throw new Error('denied');
      },
    } as unknown as S3Client);

    await expect(storage.deleteObject('uploads/a')).rejects.toMatchObject({
      code: 'STORAGE_DELETE_FAILED',
    });
  });

  it('maps NotFound the same way as NoSuchKey', async () => {
    const storage = createS3ObjectStorage(config, {
      send: async () => {
        const error = new Error('gone');
        error.name = 'NotFound';
        throw error;
      },
    } as unknown as S3Client);

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toMatchObject({ code: 'SOURCE_MISSING' });
  });
});
