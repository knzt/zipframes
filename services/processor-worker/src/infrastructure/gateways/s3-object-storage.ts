import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

import type { ObjectStorage } from '../../application/gateways/object-storage.js';
import { ProcessingError } from '../../domain/errors.js';

export interface S3ObjectStorageConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly bucket: string;
  readonly forcePathStyle: boolean;
}

const abortedError = (): ProcessingError =>
  new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'storage operation cancelled');

export const createS3ObjectStorage = (config: S3ObjectStorageConfig): ObjectStorage => {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

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
          throw new ProcessingError('permanent', 'SOURCE_MISSING', `object ${key} has no body`);
        }
        await pipeline(response.Body as Readable, createWriteStream(destinationPath));
      } catch (error) {
        if (error instanceof ProcessingError) {
          throw error;
        }
        if (signal?.aborted) {
          throw abortedError();
        }
        const name = error instanceof Error ? error.name : '';
        if (name === 'NoSuchKey' || name === 'NotFound') {
          throw new ProcessingError(
            'permanent',
            'SOURCE_MISSING',
            `object ${key} not found`,
            error,
          );
        }
        throw new ProcessingError(
          'transient',
          'STORAGE_DOWNLOAD_FAILED',
          `failed to download ${key}`,
          error,
        );
      }
    },

    uploadFile: async (key, sourcePath, contentType, signal) => {
      if (signal?.aborted) {
        throw abortedError();
      }
      try {
        const body = createReadStream(sourcePath);
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
          signal ? { abortSignal: signal } : undefined,
        );
      } catch (error) {
        if (signal?.aborted) {
          throw abortedError();
        }
        throw new ProcessingError(
          'transient',
          'STORAGE_UPLOAD_FAILED',
          `failed to upload ${key}`,
          error,
        );
      }
    },

    deleteObject: async (key) => {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (error) {
        throw new ProcessingError(
          'transient',
          'STORAGE_DELETE_FAILED',
          `failed to delete ${key}`,
          error,
        );
      }
    },

    ping: async () => {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    },
  };
};
