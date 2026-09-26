import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
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

export interface S3ObjectStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
}

export type S3ObjectStorage = ObjectStorage & Pingable;

const abortedError = (): TimeoutError =>
  new TimeoutError('PROCESSING_TIMEOUT', 'storage operation cancelled');

export const createS3ObjectStorage = (
  config: S3ObjectStorageConfig,
  client: S3Client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    // SeaweedFS stores the SDK's default flexible checksum trailer in the object body.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  }),
): S3ObjectStorage => {
  return {
    downloadToFile: async (key, destinationPath, signal) => {
      if (signal?.aborted) {
        throw abortedError();
      }
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
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
    },

    uploadFile: async (key, sourcePath, contentType, signal) => {
      if (signal?.aborted) {
        throw abortedError();
      }
      try {
        const body = createReadStream(sourcePath);
        const info = await stat(sourcePath);
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
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
    },

    deleteObject: async (key) => {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (error) {
        throw new UnavailableError('STORAGE_DELETE_FAILED', `failed to delete ${key}`, {
          cause: error,
        });
      }
    },

    ping: async () => {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },
  };
};
