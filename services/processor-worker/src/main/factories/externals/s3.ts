import { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly forcePathStyle: boolean;
}

export const createS3 = (config: S3ClientConfig): S3Client =>
  new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  });

export type S3 = ReturnType<typeof createS3>;
