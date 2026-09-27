import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { S3ObjectStorageGateway } from '../../../../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import {
  contentDispositionFor,
  S3StorageUrlSignerGateway,
} from '../../../../../src/infrastructure/gateways/storage/s3StorageUrlSigner.gateway.js';

const notFound = Object.assign(new Error('not found'), {
  name: 'NotFound',
  $metadata: { httpStatusCode: 404 },
});
const noSuchKey = Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
const status404 = Object.assign(new Error('odd'), {
  name: 'Unknown',
  $metadata: { httpStatusCode: 404 },
});

const gatewayWith = (
  answer: (command: unknown) => Promise<unknown>,
): { gateway: S3ObjectStorageGateway; send: ReturnType<typeof vi.fn> } => {
  const send = vi.fn(answer);
  const s3 = { send } as unknown as S3Client;
  return { gateway: new S3ObjectStorageGateway(s3, 'videos'), send };
};

describe('S3ObjectStorageGateway', () => {
  it('reports the stored size', async () => {
    const { gateway, send } = gatewayWith(() => Promise.resolve({ ContentLength: 2048 }));

    expect(await gateway.head('uploads/a/b')).toEqual({ sizeBytes: 2048 });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it('reads a missing length as zero bytes', async () => {
    const { gateway } = gatewayWith(() => Promise.resolve({}));

    expect(await gateway.head('uploads/a/b')).toEqual({ sizeBytes: 0 });
  });

  it.each([notFound, noSuchKey, status404])(
    'answers null for a missing object (%s)',
    async (error) => {
      const { gateway } = gatewayWith(() => Promise.reject(error));

      expect(await gateway.head('uploads/a/b')).toBeNull();
    },
  );

  it('turns any other failure into a retryable UnavailableError', async () => {
    const { gateway } = gatewayWith(() => Promise.reject(new Error('socket hang up')));

    await expect(gateway.head('k')).rejects.toMatchObject({
      code: 'STORAGE_HEAD_FAILED',
      retryable: true,
    });
    await expect(gateway.deleteObject('k')).rejects.toMatchObject({
      code: 'STORAGE_DELETE_FAILED',
    });
  });

  it('treats deleting a missing object as done', async () => {
    const { gateway } = gatewayWith(() => Promise.reject(notFound));

    await expect(gateway.deleteObject('k')).resolves.toBeUndefined();
  });

  it('deletes and pings the bucket', async () => {
    const { gateway, send } = gatewayWith(() => Promise.resolve({}));

    await gateway.deleteObject('k');
    await gateway.ping();

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(HeadBucketCommand);
  });

  it('never classifies a thrown non-Error as not found', async () => {
    const nonError: unknown = { name: 'NotFound' };
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the SDK boundary can reject with anything
    const { gateway } = gatewayWith(() => Promise.reject(nonError));

    await expect(gateway.head('k')).rejects.toMatchObject({ code: 'STORAGE_HEAD_FAILED' });
  });
});

describe('S3StorageUrlSignerGateway', () => {
  const publicS3 = new S3Client({
    endpoint: 'http://storage.zipframes.local:8333',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
  });
  const signer = new S3StorageUrlSignerGateway(publicS3, 'videos');

  it('signs a PUT on the public endpoint that binds type and length', async () => {
    const signed = await signer.signUpload({
      key: 'uploads/o/v',
      contentType: 'video/mp4',
      sizeBytes: 2048,
      expiresInSeconds: 900,
    });
    const url = new URL(signed.url);

    expect(signed.expiresInSeconds).toBe(900);
    expect(url.origin).toBe('http://storage.zipframes.local:8333');
    expect(url.pathname).toBe('/videos/uploads/o/v');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
  });

  it('signs a GET that saves the package under a readable name', async () => {
    const signed = await signer.signDownload({
      key: 'outputs/o/v.zip',
      downloadFileName: 'aula-frames.zip',
      expiresInSeconds: 300,
    });
    const url = new URL(signed.url);

    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      contentDispositionFor('aula-frames.zip'),
    );
    expect(url.searchParams.get('response-content-type')).toBe('application/zip');
  });

  it('keeps accents in the RFC 5987 form and replaces them in the fallback', () => {
    expect(contentDispositionFor('reunião "final"-frames.zip')).toBe(
      `attachment; filename="reuni_o _final_-frames.zip"; filename*=UTF-8''reuni%C3%A3o%20%22final%22-frames.zip`,
    );
  });
});
