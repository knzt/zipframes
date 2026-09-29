import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { UnavailableError } from '@zipframes/core';

import type {
  ObjectStorage,
  SignGetUrlInput,
} from '../../../application/interfaces/gateways/ObjectStorage.js';

/**
 * `attachment` with an ASCII fallback plus the RFC 5987 form, so a name with
 * accents or quotes still reaches the browser intact.
 */
export const contentDispositionFor = (fileName: string): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Signs locally, without calling the storage. The client must be built with
 * the public S3 endpoint so the URL in the e-mail is reachable.
 */
export class S3ObjectStorageGateway implements ObjectStorage {
  constructor(
    private readonly publicS3: S3Client,
    private readonly bucket: string,
  ) {}

  async signGetUrl(input: SignGetUrlInput): Promise<string> {
    try {
      return await getSignedUrl(
        this.publicS3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          ResponseContentDisposition: contentDispositionFor(input.downloadFileName),
          ResponseContentType: 'application/zip',
        }),
        { expiresIn: input.expiresInSeconds },
      );
    } catch (error) {
      throw new UnavailableError('STORAGE_SIGN_FAILED', `failed to sign GET for ${input.key}`, {
        cause: error,
      });
    }
  }
}
