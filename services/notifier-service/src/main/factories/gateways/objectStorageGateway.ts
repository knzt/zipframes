import { S3ObjectStorageGateway } from '../../../infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import type { S3 } from '../externals/s3.js';

export const createObjectStorageGateway = (publicS3: S3, bucket: string): S3ObjectStorageGateway =>
  new S3ObjectStorageGateway(publicS3, bucket);
