import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import type { S3Client } from '@aws-sdk/client-s3';
import { InternalServerError, TimeoutError, UnavailableError } from '@zipframes/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { S3ObjectStorageGateway } from '../../../../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';

const config = {
  bucket: 'videos',
};

const storageFor = (client: Pick<S3Client, 'send'>): S3ObjectStorageGateway =>
  new S3ObjectStorageGateway(client as S3Client, config.bucket);

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(tmpdir(), 's3-storage-'));
  directories.push(dir);
  return dir;
};

describe('S3ObjectStorageGateway', () => {
  it('downloads an object body to a file', async () => {
    const send = vi.fn(async () => ({ Body: Readable.from(['hello']) }));
    const storage = storageFor({ send });
    const destination = path.join(await tempDir(), 'object.bin');

    await storage.downloadToFile('uploads/a', destination);

    expect(await readFile(destination, 'utf8')).toBe('hello');
    expect(send).toHaveBeenCalledOnce();
  });

  it('uploads a local file', async () => {
    const send = vi.fn(async () => ({}));
    const storage = storageFor({ send });
    const source = path.join(await tempDir(), 'frame.png');
    await writeFile(source, 'png');

    await storage.uploadFile('outputs/a.zip', source, 'application/zip');

    expect(send).toHaveBeenCalledOnce();
  });

  it('deletes an object and pings the bucket', async () => {
    const send = vi.fn(async () => ({}));
    const storage = storageFor({ send });

    await storage.deleteObject('uploads/a');
    await storage.ping();

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('throws SOURCE_MISSING when the object has no body', async () => {
    const storage = storageFor({
      send: async () => ({}),
    });

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toMatchObject({ code: 'SOURCE_MISSING' });
  });

  it('maps NoSuchKey to SOURCE_MISSING', async () => {
    const storage = storageFor({
      send: async () => {
        const error = new Error('missing');
        error.name = 'NoSuchKey';
        throw error;
      },
    });

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toBeInstanceOf(InternalServerError);
  });

  it('maps a generic download failure to STORAGE_DOWNLOAD_FAILED', async () => {
    const storage = storageFor({
      send: async () => {
        throw new Error('timeout');
      },
    });

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'failed.bin')),
    ).rejects.toBeInstanceOf(UnavailableError);
  });

  it('aborts a download that is already cancelled', async () => {
    const storage = storageFor({ send: vi.fn() });
    const signal = AbortSignal.abort();

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'cancelled.bin'), signal),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts a download that is cancelled while sending', async () => {
    const controller = new AbortController();
    const storage = storageFor({
      send: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    });

    await expect(
      storage.downloadToFile(
        'uploads/a',
        path.join(await tempDir(), 'cancelled.bin'),
        controller.signal,
      ),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('aborts an upload that is already cancelled', async () => {
    const storage = storageFor({ send: vi.fn() });
    const source = path.join(await tempDir(), 'frame.png');
    await writeFile(source, 'png');

    await expect(
      storage.uploadFile('outputs/a.zip', source, 'application/zip', AbortSignal.abort()),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('maps upload failures and aborted uploads', async () => {
    const controller = new AbortController();
    const failing = storageFor({
      send: async () => {
        throw new Error('slow');
      },
    });
    const aborted = storageFor({
      send: async () => {
        controller.abort();
        throw new Error('aborted');
      },
    });
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
    const storage = storageFor({
      send: async () => {
        throw new Error('denied');
      },
    });

    await expect(storage.deleteObject('uploads/a')).rejects.toMatchObject({
      code: 'STORAGE_DELETE_FAILED',
    });
  });

  it('maps NotFound the same way as NoSuchKey', async () => {
    const storage = storageFor({
      send: async () => {
        const error = new Error('gone');
        error.name = 'NotFound';
        throw error;
      },
    });

    await expect(
      storage.downloadToFile('uploads/a', path.join(await tempDir(), 'missing.bin')),
    ).rejects.toMatchObject({ code: 'SOURCE_MISSING' });
  });
});
