import { LOG_LEVELS, type LogLevel } from '@zipframes/logger';
import { z } from 'zod';

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const configSchema = z.object({
  /** 0 lets the system pick a free port, which the tests use. */
  port: nonNegativeInt,
  corsOrigin: z.string().min(1),
  databaseUrl: z.string().min(1),
  amqpUrl: z.string().min(1),
  redisUrl: z.string().min(1),
  s3Endpoint: z.url(),
  s3PublicEndpoint: z.url(),
  s3AccessKey: z.string().min(1),
  s3SecretKey: z.string().min(1),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3ForcePathStyle: boolFromString,
  jwksUrl: z.url(),
  jwtIssuer: z.string().min(1),
  jwtAudience: z.string().min(1),
  maxUploadBytes: positiveInt,
  downloadUrlTtlSeconds: positiveInt,
  resultRetentionSeconds: positiveInt,
  listCacheTtlSeconds: positiveInt,
  expirationSweepIntervalMs: positiveInt,
  expirationBatchSize: positiveInt,
  consumerPrefetch: positiveInt,
  maxAttempts: positiveInt,
  retryBaseDelayMs: nonNegativeInt,
  retryMaxDelayMs: positiveInt,
  logLevel: z.enum(LOG_LEVELS as unknown as [LogLevel, ...LogLevel[]]),
  serviceVersion: z.string().min(1),
});

export type Config = z.infer<typeof configSchema>;

const ENV_BY_FIELD: Record<keyof Config, string> = {
  port: 'PORT',
  corsOrigin: 'CORS_ORIGIN',
  databaseUrl: 'VIDEO_DATABASE_URL',
  amqpUrl: 'AMQP_URL',
  redisUrl: 'REDIS_URL',
  s3Endpoint: 'S3_ENDPOINT',
  s3PublicEndpoint: 'S3_PUBLIC_ENDPOINT',
  s3AccessKey: 'S3_ACCESS_KEY',
  s3SecretKey: 'S3_SECRET_KEY',
  s3Region: 'S3_REGION',
  s3Bucket: 'S3_BUCKET',
  s3ForcePathStyle: 'S3_FORCE_PATH_STYLE',
  jwksUrl: 'JWT_JWKS_URL',
  jwtIssuer: 'JWT_ISSUER',
  jwtAudience: 'JWT_AUDIENCE',
  maxUploadBytes: 'MAX_UPLOAD_BYTES',
  downloadUrlTtlSeconds: 'DOWNLOAD_URL_TTL_SECONDS',
  resultRetentionSeconds: 'RESULT_RETENTION_SECONDS',
  listCacheTtlSeconds: 'LIST_CACHE_TTL_SECONDS',
  expirationSweepIntervalMs: 'EXPIRATION_SWEEP_INTERVAL_MS',
  expirationBatchSize: 'EXPIRATION_BATCH_SIZE',
  consumerPrefetch: 'CONSUMER_PREFETCH',
  maxAttempts: 'MAX_ATTEMPTS',
  retryBaseDelayMs: 'RETRY_BASE_DELAY_MS',
  retryMaxDelayMs: 'RETRY_MAX_DELAY_MS',
  logLevel: 'LOG_LEVEL',
  serviceVersion: 'SERVICE_VERSION',
};

export const formatZodError = (error: z.ZodError): Error => {
  const path = String(error.issues[0]?.path[0]);
  const field = path in ENV_BY_FIELD ? ENV_BY_FIELD[path as keyof Config] : path;
  return new Error(`invalid environment variable: ${field}`);
};

/**
 * Reads the process configuration. Business windows (download URL lifetime,
 * 24h retention, 100 MB limit) default to the values in
 * docs/domain/dominio.md and can be tuned per environment.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const read = (name: string, fallback?: string): string | undefined =>
    emptyToUndefined(env[name]) ?? fallback;
  const s3Endpoint = read('S3_ENDPOINT');

  try {
    return configSchema.parse({
      port: read('PORT', '3001'),
      corsOrigin: read('CORS_ORIGIN', '*'),
      databaseUrl: read('VIDEO_DATABASE_URL'),
      amqpUrl: read('AMQP_URL'),
      redisUrl: read('REDIS_URL'),
      s3Endpoint,
      s3PublicEndpoint: read('S3_PUBLIC_ENDPOINT', s3Endpoint),
      s3AccessKey: read('S3_ACCESS_KEY'),
      s3SecretKey: read('S3_SECRET_KEY'),
      s3Region: read('S3_REGION', 'us-east-1'),
      s3Bucket: read('S3_BUCKET'),
      s3ForcePathStyle: read('S3_FORCE_PATH_STYLE', 'true'),
      jwksUrl: read('JWT_JWKS_URL'),
      jwtIssuer: read('JWT_ISSUER'),
      jwtAudience: read('JWT_AUDIENCE'),
      maxUploadBytes: read('MAX_UPLOAD_BYTES', String(100 * 1024 * 1024)),
      downloadUrlTtlSeconds: read('DOWNLOAD_URL_TTL_SECONDS', '300'),
      resultRetentionSeconds: read('RESULT_RETENTION_SECONDS', String(24 * 60 * 60)),
      listCacheTtlSeconds: read('LIST_CACHE_TTL_SECONDS', '60'),
      expirationSweepIntervalMs: read('EXPIRATION_SWEEP_INTERVAL_MS', '60000'),
      expirationBatchSize: read('EXPIRATION_BATCH_SIZE', '100'),
      consumerPrefetch: read('CONSUMER_PREFETCH', '10'),
      maxAttempts: read('MAX_ATTEMPTS', '5'),
      retryBaseDelayMs: read('RETRY_BASE_DELAY_MS', '1000'),
      retryMaxDelayMs: read('RETRY_MAX_DELAY_MS', '30000'),
      logLevel: read('LOG_LEVEL', 'info'),
      serviceVersion: read('SERVICE_VERSION', '0.1.0'),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw formatZodError(error);
    }
    throw error;
  }
};
