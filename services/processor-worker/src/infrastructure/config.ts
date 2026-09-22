import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => value === true || value === 'true' || value === '1');

const configSchema = z.object({
  amqpUrl: z.string().min(1),
  s3Endpoint: z.url(),
  s3AccessKey: z.string().min(1),
  s3SecretKey: z.string().min(1),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3ForcePathStyle: boolFromString,
  workDir: z.string().min(1),
  processingTimeoutMs: z.coerce.number().int().positive(),
  maxAttempts: z.coerce.number().int().positive(),
  retryBaseDelayMs: z.coerce.number().int().nonnegative(),
  retryMaxDelayMs: z.coerce.number().int().positive(),
  healthPort: z.coerce.number().int().positive(),
  metricsPort: z.coerce.number().int().positive(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  serviceVersion: z.string().min(1),
});

export type WorkerConfig = z.infer<typeof configSchema>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig =>
  configSchema.parse({
    amqpUrl: env.AMQP_URL,
    s3Endpoint: env.S3_ENDPOINT,
    s3AccessKey: env.S3_ACCESS_KEY,
    s3SecretKey: env.S3_SECRET_KEY,
    s3Region: env.S3_REGION ?? 'us-east-1',
    s3Bucket: env.S3_BUCKET,
    s3ForcePathStyle: env.S3_FORCE_PATH_STYLE ?? 'true',
    workDir: env.WORK_DIR ?? '/tmp/zipframes-processor',
    processingTimeoutMs: env.PROCESSING_TIMEOUT_MS ?? '300000',
    maxAttempts: env.MAX_ATTEMPTS ?? '5',
    retryBaseDelayMs: env.RETRY_BASE_DELAY_MS ?? '1000',
    retryMaxDelayMs: env.RETRY_MAX_DELAY_MS ?? '30000',
    healthPort: env.HEALTH_PORT ?? '8081',
    metricsPort: env.METRICS_PORT ?? '9091',
    logLevel: env.LOG_LEVEL ?? 'info',
    serviceVersion: env.SERVICE_VERSION ?? '0.0.0',
  });
