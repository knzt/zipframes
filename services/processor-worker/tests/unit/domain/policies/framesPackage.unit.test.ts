import { describe, expect, it } from 'vitest';

import { framesPackageObjectKey } from '../../../../src/domain/policies/framesPackage.js';

describe('framesPackageObjectKey', () => {
  it('builds the frames-package object key', () => {
    expect(framesPackageObjectKey('owner', 'vid')).toBe('outputs/owner/vid.zip');
  });
});
