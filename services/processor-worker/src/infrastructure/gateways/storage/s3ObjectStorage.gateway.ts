import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  InfrastructureError,
  InternalServerError,
  TimeoutError,
  UnavailableError,
} from '@zipframes/core';
import type { Pingable } from '@zipframes/core';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import type { ObjectStorage } from '../../../application/interfaces/gateways/ObjectStorage.js';

export type S3ObjectStorageGatewayPort = ObjectStorage & Pingable;

const abortedError = (): TimeoutError =>
  new TimeoutError('PROCESSING_TIMEOUT', 'storage operation cancelled');

export interface S3ObjectStorageGatewayDeps {
  readonly s3: S3Client;
  readonly bucket: string;
}

export class S3ObjectStorageGateway implements S3ObjectStorageGatewayPort {
  constructor(private readonly deps: S3ObjectStorageGatewayDeps) {}

  async downloadToFile(key: string, destinationPath: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw abortedError();
    }
    try {
      const response = await this.deps.s3.send(
        new GetObjectCommand({ Bucket: this.deps.bucket, Key: key }),
        signal ? { abortSignal: signal } : undefined,
      );
      if (!response.Body) {
        throw new InternalServerError('SOURCE_MISSING', `object ${key} has no body`);
      }
      await pipeline(response.Body as Readable, createWriteStream(destinationPath));
    } catch (error) {
      if (error instanceof InfrastructureError) {
        throw error;
      }
      if (signal?.aborted) {
        throw abortedError();
      }
      const name = error instanceof Error ? error.name : '';
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new InternalServerError('SOURCE_MISSING', `object ${key} not found`, {
          cause: error,
        });
      }
      throw new UnavailableError('STORAGE_DOWNLOAD_FAILED', `failed to download ${key}`, {
        cause: error,
      });
    }
  }

  async uploadFile(
    key: string,
    sourcePath: string,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      throw abortedError();
    }
    try {
      const body = createReadStream(sourcePath);
      const info = await stat(sourcePath);
      await this.deps.s3.send(
        new PutObjectCommand({
          Bucket: this.deps.bucket,
          Key: key,
          Body: body,
          ContentLength: info.size,
          ContentType: contentType,
        }),
        signal ? { abortSignal: signal } : undefined,
      );
    } catch (error) {
      if (signal?.aborted) {
        throw abortedError();
      }
      throw new UnavailableError('STORAGE_UPLOAD_FAILED', `failed to upload ${key}`, {
        cause: error,
      });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.deps.s3.send(new DeleteObjectCommand({ Bucket: this.deps.bucket, Key: key }));
    } catch (error) {
      throw new UnavailableError('STORAGE_DELETE_FAILED', `failed to delete ${key}`, {
        cause: error,
      });
    }
  }

  async ping(): Promise<void> {
    await this.deps.s3.send(new HeadBucketCommand({ Bucket: this.deps.bucket }));
  }
}
