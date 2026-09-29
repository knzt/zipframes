import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/infrastructure/loadEnvConfig.js';

const required = {
  VIDEO_DATABASE_URL: 'postgresql://zipframes:zipframes@localhost:5433/video_db',
  AMQP_URL: 'amqp://zipframes:zipframes@localhost:5672',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY: 'zipframes',
  S3_SECRET_KEY: 'zipframes-local-secret',
  S3_BUCKET: 'videos',
  JWT_JWKS_URL: 'http://localhost:3000/.well-known/jwks.json',
  JWT_ISSUER: 'https://auth.zipframes.local',
  JWT_AUDIENCE: 'zipframes',
};

describe('loadConfig', () => {
  it('applies the business defaults from the domain documentation', () => {
    expect(loadConfig(required)).toMatchObject({
      port: 3001,
      corsOrigin: '*',
      s3PublicEndpoint: 'http://localhost:8333',
      s3Region: 'us-east-1',
      s3ForcePathStyle: true,
      maxUploadBytes: 104_857_600,
      downloadUrlTtlSeconds: 300,
      resultRetentionSeconds: 86_400,
      listCacheTtlSeconds: 60,
      expirationSweepIntervalMs: 60_000,
      expirationBatchSize: 100,
      consumerPrefetch: 10,
      maxAttempts: 5,
      logLevel: 'info',
    });
  });

  it('reads overrides and treats empty values as unset', () => {
    const config = loadConfig({
      ...required,
      PORT: '0',
      S3_PUBLIC_ENDPOINT: 'http://storage.zipframes.local',
      S3_FORCE_PATH_STYLE: 'false',
      RESULT_RETENTION_SECONDS: '1',
      LOG_LEVEL: '',
    });

    expect(config).toMatchObject({
      port: 0,
      s3PublicEndpoint: 'http://storage.zipframes.local',
      s3ForcePathStyle: false,
      resultRetentionSeconds: 1,
      logLevel: 'info',
    });
  });

  it.each([
    ['VIDEO_DATABASE_URL', { VIDEO_DATABASE_URL: '' }],
    ['S3_ENDPOINT', { S3_ENDPOINT: 'not a url' }],
    ['MAX_UPLOAD_BYTES', { MAX_UPLOAD_BYTES: '-5' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
  ])('names the variable %s when it is invalid', (name, override) => {
    expect(() => loadConfig({ ...required, ...override })).toThrow(
      `invalid environment variable: ${name}`,
    );
  });
});
