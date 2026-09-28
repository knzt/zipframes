import {
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { S3ObjectStorageGateway } from '../../../../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import {
  contentDispositionFor,
  S3DownloadUrlSignerGateway,
} from '../../../../../src/infrastructure/gateways/storage/s3DownloadUrlSigner.gateway.js';

const notFound = Object.assign(new Error('not found'), {
  name: 'NotFound',
  $metadata: { httpStatusCode: 404 },
});
const gatewayWith = (
  answer: (command: unknown) => Promise<unknown>,
): { gateway: S3ObjectStorageGateway; send: ReturnType<typeof vi.fn> } => {
  // A real client, so `Upload` finds its config; only the network call is replaced.
  const s3 = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
  });
  const send = vi.fn(answer);
  s3.send = send;
  return { gateway: new S3ObjectStorageGateway(s3, 'videos'), send };
};

describe('S3ObjectStorageGateway', () => {
  it('streams the content to the key and counts the bytes that passed', async () => {
    const { gateway, send } = gatewayWith(() => Promise.resolve({}));

    const stored = await gateway.upload(
      'uploads/a/b',
      Readable.from([Buffer.alloc(3), Buffer.alloc(5)]),
      'video/mp4',
    );

    expect(stored).toEqual({ sizeBytes: 8 });
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'videos',
      Key: 'uploads/a/b',
      ContentType: 'video/mp4',
    });
  });

  it('turns a storage failure into a retryable UnavailableError', async () => {
    const { gateway } = gatewayWith(() => Promise.reject(new Error('socket hang up')));

    await expect(
      gateway.upload('k', Readable.from([Buffer.alloc(1)]), 'video/mp4'),
    ).rejects.toMatchObject({ code: 'STORAGE_UPLOAD_FAILED', retryable: true });
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

    await expect(gateway.deleteObject('k')).rejects.toMatchObject({
      code: 'STORAGE_DELETE_FAILED',
    });
  });
});

describe('S3DownloadUrlSignerGateway', () => {
  const publicS3 = new S3Client({
    endpoint: 'http://storage.zipframes.local:8333',
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
  });
  const signer = new S3DownloadUrlSignerGateway(publicS3, 'videos');

  it('signs a GET on the public endpoint that saves the package under a readable name', async () => {
    const signed = await signer.sign({
      key: 'outputs/o/v.zip',
      downloadFileName: 'aula-frames.zip',
      expiresInSeconds: 300,
    });
    const url = new URL(signed.url);

    expect(url.origin).toBe('http://storage.zipframes.local:8333');
    expect(url.pathname).toBe('/videos/outputs/o/v.zip');
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
