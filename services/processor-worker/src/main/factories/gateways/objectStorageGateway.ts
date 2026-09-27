import { S3ObjectStorageGateway } from '../../../infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import type { S3 } from '../externals/s3.js';

export interface ObjectStorageGatewayDeps {
  readonly s3: S3;
  readonly bucket: string;
}

export const createObjectStorageGateway = ({
  s3,
  bucket,
}: ObjectStorageGatewayDeps): S3ObjectStorageGateway => new S3ObjectStorageGateway(s3, bucket);
