import { S3StorageUrlSignerGateway } from '../../../infrastructure/gateways/storage/s3StorageUrlSigner.gateway.js';
import type { S3 } from '../externals/s3.js';

export interface StorageUrlSignerGatewayDeps {
  /** The client built with the endpoint the browser reaches. */
  readonly publicS3: S3;
  readonly bucket: string;
}

export const createStorageUrlSignerGateway = ({
  publicS3,
  bucket,
}: StorageUrlSignerGatewayDeps): S3StorageUrlSignerGateway =>
  new S3StorageUrlSignerGateway(publicS3, bucket);
