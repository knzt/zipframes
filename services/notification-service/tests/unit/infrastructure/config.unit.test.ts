import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/infrastructure/loadEnvConfig.js';

const valid = {
  NOTIFICATION_DATABASE_URL: 'postgresql://zipframes:zipframes@localhost:5434/notification_db',
  AMQP_URL: 'amqp://zipframes:zipframes@localhost:5672',
  SMTP_URL: 'smtp://localhost:1025',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_PUBLIC_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY: 'zipframes',
  S3_SECRET_KEY: 'secret',
  S3_BUCKET: 'videos',
  APP_PUBLIC_URL: 'http://localhost:3001',
};

describe('loadConfig', () => {
  it('parses environment variables and applies defaults', () => {
    const config = loadConfig(valid);

    expect(config.s3Bucket).toBe('videos');
    expect(config.maxAttempts).toBe(3);
    expect(config.s3ForcePathStyle).toBe(true);
    expect(config.smtpFrom).toBe('ZipFrames <noreply@zipframes.local>');
    expect(config.downloadUrlTtlSeconds).toBe(86_400);
    expect(config.appPublicUrl).toBe('http://localhost:3001');
  });

  it('rejects a missing required variable', () => {
    expect(() => loadConfig({})).toThrow('invalid environment variable: NOTIFICATION_DATABASE_URL');
  });

  it('names APP_PUBLIC_URL when the public URL is invalid', () => {
    expect(() => loadConfig({ ...valid, APP_PUBLIC_URL: 'not-a-url' })).toThrow(
      'invalid environment variable: APP_PUBLIC_URL',
    );
  });
});
