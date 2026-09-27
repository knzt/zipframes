import { GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  SignDownloadInput,
  SignedUrl,
  SignUploadInput,
  StorageUrlSigner,
} from '../../../application/interfaces/gateways/StorageUrlSigner.js';

/**
 * `attachment` with an ASCII fallback plus the RFC 5987 form, so a name with
 * accents or quotes still reaches the browser intact.
 */
export const contentDispositionFor = (fileName: string): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/gu, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

/**
 * Signs URLs locally, without calling the storage. The client must be built
 * with the endpoint the browser reaches, which inside Compose or a cluster
 * is not the one this process uses.
 */
export class S3StorageUrlSignerGateway implements StorageUrlSigner {
  constructor(
    private readonly publicS3: S3Client,
    private readonly bucket: string,
  ) {}

  async signUpload(input: SignUploadInput): Promise<SignedUrl> {
    const url = await getSignedUrl(
      this.publicS3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
      }),
      {
        expiresIn: input.expiresInSeconds,
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return { url, expiresInSeconds: input.expiresInSeconds };
  }

  async signDownload(input: SignDownloadInput): Promise<SignedUrl> {
    const url = await getSignedUrl(
      this.publicS3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ResponseContentDisposition: contentDispositionFor(input.downloadFileName),
        ResponseContentType: 'application/zip',
      }),
      { expiresIn: input.expiresInSeconds },
    );
    return { url, expiresInSeconds: input.expiresInSeconds };
  }
}
