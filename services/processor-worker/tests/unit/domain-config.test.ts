import { describe, expect, it } from 'vitest';

import { ProcessingError } from '../../src/domain/errors.js';
import { frameFileName } from '../../src/domain/frame-extraction-policy.js';
import { framesPackageObjectKey } from '../../src/domain/frames-package.js';
import { loadConfig } from '../../src/infrastructure/config.js';

describe('domain helpers', () => {
  it('builds deterministic frame names and frames-package keys', () => {
    expect(frameFileName(1)).toBe('frame_0001.png');
    expect(frameFileName(12)).toBe('frame_0012.png');
    expect(framesPackageObjectKey('owner', 'vid')).toBe('outputs/owner/vid.zip');
  });
});

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
      HEALTH_PORT: '8081',
      METRICS_PORT: '9091',
      LOG_LEVEL: 'info',
      SERVICE_VERSION: '0.0.0',
    });

    expect(config.s3Bucket).toBe('videos');
    expect(config.maxAttempts).toBe(3);
    expect(config.s3ForcePathStyle).toBe(true);
    expect(config.healthPort).toBe(8081);
    expect(config.metricsPort).toBe(9091);
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
    expect(config.healthPort).toBe(8081);
    expect(config.logLevel).toBe('info');
  });

  it('rejects a missing required variable', () => {
    expect(() => loadConfig({})).toThrow();
  });
});

describe('ProcessingError', () => {
  it('keeps the cause when one is provided', () => {
    const cause = new Error('disk');
    const error = new ProcessingError('transient', 'ZIP_WRITE_FAILED', 'failed writing zip', cause);
    expect(error.cause).toBe(cause);
    expect(error.kind).toBe('transient');
  });
});
