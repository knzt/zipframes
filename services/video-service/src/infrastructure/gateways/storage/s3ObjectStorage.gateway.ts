import {
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { UnavailableError } from '@zipframes/core';
import type { Pingable } from '@zipframes/core';

import type {
  ObjectStorage,
  StoredObject,
} from '../../../application/interfaces/gateways/ObjectStorage.js';

export type S3ObjectStorageGatewayPort = ObjectStorage & Pingable;

const isNotFound = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return error.name === 'NotFound' || error.name === 'NoSuchKey' || status === 404;
};

export class S3ObjectStorageGateway implements S3ObjectStorageGatewayPort {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
  ) {}

  async head(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: response.ContentLength ?? 0 };
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }
      throw new UnavailableError('STORAGE_HEAD_FAILED', `failed to inspect ${key}`, {
        cause: error,
      });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw new UnavailableError('STORAGE_DELETE_FAILED', `failed to delete ${key}`, {
        cause: error,
      });
    }
  }

  async ping(): Promise<void> {
    await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
