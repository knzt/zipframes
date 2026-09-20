import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
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
    downloadToFile: async (key, destinationPath) => {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        if (!response.Body) {
          throw new ProcessingError('permanent', 'SOURCE_MISSING', `object ${key} has no body`);
        }
        await pipeline(response.Body as Readable, createWriteStream(destinationPath));
      } catch (error) {
        if (error instanceof ProcessingError) {
          throw error;
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

    uploadFile: async (key, sourcePath, contentType) => {
      try {
        const body = await readFile(sourcePath);
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
      } catch (error) {
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
  };
};
