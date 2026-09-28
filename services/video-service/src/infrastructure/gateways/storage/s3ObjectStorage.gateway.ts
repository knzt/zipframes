import { Transform, pipeline, type Readable } from 'node:stream';

import { DeleteObjectCommand, HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
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

  /** Multipart upload of a stream of unknown length, counting the bytes as they pass. */
  async upload(key: string, content: Readable, contentType: string): Promise<StoredObject> {
    let sizeBytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        sizeBytes += chunk.length;
        done(null, chunk);
      },
    });
    // `pipeline` forwards an aborted request as an error, so the upload
    // fails instead of waiting for bytes that will never come.
    const body = pipeline(content, counter, () => undefined);

    try {
      await new Upload({
        client: this.s3,
        params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType },
      }).done();
    } catch (error) {
      throw new UnavailableError('STORAGE_UPLOAD_FAILED', `failed to upload ${key}`, {
        cause: error,
      });
    }
    return { sizeBytes };
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
