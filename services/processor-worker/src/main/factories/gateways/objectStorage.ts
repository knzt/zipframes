import { S3ObjectStorage } from '../../../infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import type { S3 } from '../externals/s3.js';

export const createObjectStorage = (s3: S3, bucket: string): S3ObjectStorage =>
  new S3ObjectStorage(s3, bucket);
