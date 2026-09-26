import type { S3Client } from '@aws-sdk/client-s3';

import { S3ObjectStorage } from '../../../infrastructure/gateways/storage/s3ObjectStorage.gateway.js';

export const createObjectStorage = (s3: S3Client, bucket: string): S3ObjectStorage =>
  new S3ObjectStorage(s3, bucket);
