import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const configSchema = z.object({
  databaseUrl: z.string().min(1),
  amqpUrl: z.string().min(1),
  smtpUrl: z.string().min(1),
  smtpFrom: z.string().min(1),
  s3Endpoint: z.url(),
  s3PublicEndpoint: z.url(),
  s3AccessKey: z.string().min(1),
  s3SecretKey: z.string().min(1),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3ForcePathStyle: boolFromString,
  appPublicUrl: z.url(),
  maxAttempts: z.coerce.number().int().positive(),
  retryBaseDelayMs: z.coerce.number().int().nonnegative(),
  retryMaxDelayMs: z.coerce.number().int().positive(),
  downloadUrlTtlSeconds: z.coerce.number().int().positive(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  serviceVersion: z.string().min(1),
  operationsPort: z.coerce.number().int().nonnegative().max(65535),
});

export type NotificationConfig = z.infer<typeof configSchema>;

const ENV_BY_FIELD: Record<string, string> = {
  databaseUrl: 'NOTIFICATION_DATABASE_URL',
  amqpUrl: 'AMQP_URL',
  smtpUrl: 'SMTP_URL',
  smtpFrom: 'SMTP_FROM',
  s3Endpoint: 'S3_ENDPOINT',
  s3PublicEndpoint: 'S3_PUBLIC_ENDPOINT',
  s3AccessKey: 'S3_ACCESS_KEY',
  s3SecretKey: 'S3_SECRET_KEY',
  s3Region: 'S3_REGION',
  s3Bucket: 'S3_BUCKET',
  s3ForcePathStyle: 'S3_FORCE_PATH_STYLE',
  appPublicUrl: 'APP_PUBLIC_URL',
  maxAttempts: 'MAX_ATTEMPTS',
  retryBaseDelayMs: 'RETRY_BASE_DELAY_MS',
  retryMaxDelayMs: 'RETRY_MAX_DELAY_MS',
  downloadUrlTtlSeconds: 'DOWNLOAD_URL_TTL_SECONDS',
  logLevel: 'LOG_LEVEL',
  serviceVersion: 'SERVICE_VERSION',
  operationsPort: 'OPERATIONS_PORT',
};

const formatZodError = (error: z.ZodError): Error => {
  const path = error.issues[0]?.path[0];
  const field = ENV_BY_FIELD[String(path)] ?? String(path);
  return new Error(`invalid environment variable: ${field}`);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): NotificationConfig => {
  try {
    return configSchema.parse({
      databaseUrl: env.NOTIFICATION_DATABASE_URL,
      amqpUrl: env.AMQP_URL,
      smtpUrl: env.SMTP_URL,
      smtpFrom: env.SMTP_FROM ?? 'ZipFrames <noreply@zipframes.local>',
      s3Endpoint: env.S3_ENDPOINT,
      s3PublicEndpoint: env.S3_PUBLIC_ENDPOINT,
      s3AccessKey: env.S3_ACCESS_KEY,
      s3SecretKey: env.S3_SECRET_KEY,
      s3Region: env.S3_REGION ?? 'us-east-1',
      s3Bucket: env.S3_BUCKET,
      s3ForcePathStyle: env.S3_FORCE_PATH_STYLE ?? 'true',
      appPublicUrl: env.APP_PUBLIC_URL,
      maxAttempts: env.MAX_ATTEMPTS ?? '3',
      retryBaseDelayMs: env.RETRY_BASE_DELAY_MS ?? '1000',
      retryMaxDelayMs: env.RETRY_MAX_DELAY_MS ?? '30000',
      downloadUrlTtlSeconds: env.DOWNLOAD_URL_TTL_SECONDS ?? '86400',
      logLevel: env.LOG_LEVEL ?? 'info',
      serviceVersion: env.SERVICE_VERSION ?? '0.1.0',
      operationsPort: env.OPERATIONS_PORT ?? '9464',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw formatZodError(error);
    }
    throw error;
  }
};
