import { describe, expect, it } from 'vitest';

import {
  downloadFallbackUrl,
  failedMail,
  processedMail,
} from '../../../../src/domain/policies/notificationMail.js';

describe('notificationMail', () => {
  it('includes the signed URL and the authenticated fallback', () => {
    const mail = processedMail({
      originalFileName: 'clip.mp4',
      frameCount: 12,
      signedUrl: 'https://storage.example/clip.zip?X-Amz-Signature=test',
      fallbackUrl: downloadFallbackUrl(
        'http://localhost:3001/',
        '11111111-1111-4111-8111-111111111111',
      ),
    });

    expect(mail.subject).toContain('clip.mp4');
    expect(mail.text).toContain('https://storage.example/clip.zip?X-Amz-Signature=test');
    expect(mail.text).toContain(
      'http://localhost:3001/videos/11111111-1111-4111-8111-111111111111/download',
    );
    expect(mail.text).toContain('JWT Bearer');
  });

  it('states the failure without a content link', () => {
    const mail = failedMail({ originalFileName: 'clip.mp4', reason: 'no frames extracted' });

    expect(mail.subject).toContain('clip.mp4');
    expect(mail.text).toContain('no frames extracted');
    expect(mail.text).not.toContain('http://');
  });
});
