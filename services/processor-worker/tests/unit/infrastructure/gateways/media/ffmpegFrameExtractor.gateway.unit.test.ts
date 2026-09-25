import { describe, expect, it } from 'vitest';

import { classifyFfmpegFailure } from '../../../../../src/infrastructure/gateways/media/ffmpegFrameExtractor.gateway.js';

describe('classifyFfmpegFailure', () => {
  it.each([
    'Invalid data found when processing input',
    'Unknown format',
    'moov atom not found',
    'Invalid argument',
    'Protocol not found',
  ])('classifies non-retryable stderr: %s', (stderr) => {
    const error = classifyFfmpegFailure(1, stderr);
    expect(error.retryable).toBe(false);
    expect(error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it.each([
    'Connection reset by peer',
    'Error opening input files',
    'Resource temporarily unavailable',
    '',
  ])('classifies retryable stderr: %s', (stderr) => {
    const error = classifyFfmpegFailure(1, stderr);
    expect(error.retryable).toBe(true);
    expect(error.code).toBe('FFMPEG_FAILED');
  });
});
