import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UnavailableError } from '@zipframes/core';
import { describe, expect, it, vi } from 'vitest';

import {
  contentDispositionFor,
  S3ObjectStorageGateway,
} from '../../../../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async () => 'https://storage.example/clip.zip?X-Amz-Signature=test'),
}));

describe('contentDispositionFor', () => {
  it('keeps an ASCII name and encodes a name with accents', () => {
    expect(contentDispositionFor('clip.zip')).toContain('filename="clip.zip"');
    expect(contentDispositionFor('mês.zip')).toContain("filename*=UTF-8''");
  });
});

describe('S3ObjectStorageGateway', () => {
  it('signs a GET against the public client', async () => {
    const send = vi.fn();
    const gateway = new S3ObjectStorageGateway({ send } as never, 'videos');

    const url = await gateway.signGetUrl({
      key: 'outputs/owner/video.zip',
      expiresInSeconds: 86_400,
      downloadFileName: 'clip.zip',
    });

    expect(url).toContain('X-Amz-Signature=test');
    expect(getSignedUrl).toHaveBeenCalledWith({ send }, expect.any(GetObjectCommand), {
      expiresIn: 86_400,
    });
  });

  it('wraps a signing failure', async () => {
    vi.mocked(getSignedUrl).mockRejectedValueOnce(new Error('signer down'));
    const gateway = new S3ObjectStorageGateway({ send: vi.fn() } as never, 'videos');

    await expect(
      gateway.signGetUrl({
        key: 'outputs/owner/video.zip',
        expiresInSeconds: 60,
        downloadFileName: 'clip.zip',
      }),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
