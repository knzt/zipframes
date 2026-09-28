import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  DownloadUrlSigner,
  SignDownloadInput,
  SignedDownloadUrl,
} from '../../../application/interfaces/gateways/DownloadUrlSigner.js';

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
 * the endpoint the browser reaches, which inside Compose or a cluster is not
 * the one this process uses.
 */
export class S3DownloadUrlSignerGateway implements DownloadUrlSigner {
  constructor(
    private readonly publicS3: S3Client,
    private readonly bucket: string,
  ) {}

  async sign(download: SignDownloadInput): Promise<SignedDownloadUrl> {
    const url = await getSignedUrl(
      this.publicS3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: download.key,
        ResponseContentDisposition: contentDispositionFor(download.downloadFileName),
        ResponseContentType: 'application/zip',
      }),
      { expiresIn: download.expiresInSeconds },
    );
    return { url, expiresInSeconds: download.expiresInSeconds };
  }
}
