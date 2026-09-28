import { S3DownloadUrlSignerGateway } from '../../../infrastructure/gateways/storage/s3DownloadUrlSigner.gateway.js';
import type { S3 } from '../externals/s3.js';

export interface DownloadUrlSignerGatewayDeps {
  /** The client built with the endpoint the browser reaches. */
  readonly publicS3: S3;
  readonly bucket: string;
}

export const createDownloadUrlSignerGateway = ({
  publicS3,
  bucket,
}: DownloadUrlSignerGatewayDeps): S3DownloadUrlSignerGateway =>
  new S3DownloadUrlSignerGateway(publicS3, bucket);
