import { describe, expect, it } from 'vitest';

import { classifyFfmpegFailure } from '../../src/infrastructure/gateways/ffmpeg-frame-extractor.js';

describe('classifyFfmpegFailure', () => {
  it.each([
    'Invalid data found when processing input',
    'Unknown format',
    'moov atom not found',
    'Invalid argument',
    'Protocol not found',
  ])('classifies permanent stderr: %s', (stderr) => {
    const error = classifyFfmpegFailure(1, stderr);
    expect(error.kind).toBe('permanent');
    expect(error.code).toBe('UNSUPPORTED_MEDIA');
  });

  it.each([
    'Connection reset by peer',
    'Error opening input files',
    'Resource temporarily unavailable',
    '',
  ])('classifies transient stderr: %s', (stderr) => {
    const error = classifyFfmpegFailure(1, stderr);
    expect(error.kind).toBe('transient');
    expect(error.code).toBe('FFMPEG_FAILED');
  });
});
