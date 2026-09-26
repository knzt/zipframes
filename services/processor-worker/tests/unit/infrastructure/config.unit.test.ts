import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/infrastructure/loadEnvConfig.js';

describe('loadConfig', () => {
  it('parses environment variables', () => {
    const config = loadConfig({
      AMQP_URL: 'amqp://guest:guest@localhost:5672',
      S3_ENDPOINT: 'http://localhost:8333',
      S3_ACCESS_KEY: 'zipframes',
      S3_SECRET_KEY: 'secret',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'videos',
      S3_FORCE_PATH_STYLE: 'true',
      WORK_DIR: '/tmp/work',
      PROCESSING_TIMEOUT_MS: '1000',
      MAX_ATTEMPTS: '3',
      RETRY_BASE_DELAY_MS: '100',
      RETRY_MAX_DELAY_MS: '1000',
      LOG_LEVEL: 'info',
      SERVICE_VERSION: '0.0.0',
    });

    expect(config.s3Bucket).toBe('videos');
    expect(config.maxAttempts).toBe(3);
    expect(config.s3ForcePathStyle).toBe(true);
  });

  it('applies defaults and rejects a boolean false for path style', () => {
    const config = loadConfig({
      AMQP_URL: 'amqp://guest:guest@localhost:5672',
      S3_ENDPOINT: 'http://localhost:8333',
      S3_ACCESS_KEY: 'zipframes',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'videos',
      S3_FORCE_PATH_STYLE: '0',
    });

    expect(config.s3Region).toBe('us-east-1');
    expect(config.s3ForcePathStyle).toBe(false);
    expect(config.maxAttempts).toBe(5);
    expect(config.logLevel).toBe('info');
  });

  it('rejects a missing required variable', () => {
    expect(() => loadConfig({})).toThrow('invalid environment variable: AMQP_URL');
  });

  it('names S3_ENDPOINT when the object storage URL is invalid', () => {
    expect(() =>
      loadConfig({
        AMQP_URL: 'amqp://guest:guest@localhost:5672',
        S3_ENDPOINT: 'not-a-url',
        S3_ACCESS_KEY: 'zipframes',
        S3_SECRET_KEY: 'secret',
        S3_BUCKET: 'videos',
      }),
    ).toThrow('invalid environment variable: S3_ENDPOINT');
  });
});
