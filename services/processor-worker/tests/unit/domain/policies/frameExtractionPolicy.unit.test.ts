import { describe, expect, it } from 'vitest';

import { frameFileName } from '../../../../src/domain/policies/frameExtractionPolicy.js';

describe('frameFileName', () => {
  it('builds deterministic frame names', () => {
    expect(frameFileName(1)).toBe('frame_0001.png');
    expect(frameFileName(12)).toBe('frame_0012.png');
  });
});
