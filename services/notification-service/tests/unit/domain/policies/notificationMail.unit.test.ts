import { describe, expect, it } from 'vitest';

import {
  downloadFallbackUrl,
  failedMail,
  processedMail,
  uploadRetryUrl,
} from '../../../../src/domain/policies/notificationMail.js';

describe('notificationMail', () => {
  it('includes the signed URL, the fallback, and that the zip expires in 24 hours', () => {
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
      [
        'Se ele falhar, gere um novo em:',
        'http://localhost:3001/videos/11111111-1111-4111-8111-111111111111/download',
        '',
        'O arquivo expira em 24 horas.',
      ].join('\n'),
    );
    expect(mail.text).not.toContain('JWT Bearer');
    expect(mail.text).not.toContain('O link vale 24 horas');
  });

  it('states the failure with the file name, upload date, and retry URL', () => {
    const mail = failedMail({
      originalFileName: 'clip.mp4',
      uploadedAt: new Date('2026-09-22T12:00:00.000Z'),
      retryUrl: uploadRetryUrl('http://localhost:3001/'),
    });

    expect(mail.subject).toContain('clip.mp4');
    expect(mail.text).toContain('Não foi possível processar clip.mp4, enviado em 22/09/2026.');
    expect(mail.text).toContain('http://localhost:3001/videos');
    expect(mail.text).not.toContain('no frames');
    expect(mail.text).not.toContain('errorCode');
    expect(mail.text).not.toContain('/download');
  });

  it('omits the upload date when uploadedAt is missing', () => {
    const mail = failedMail({
      originalFileName: 'clip.mp4',
      retryUrl: uploadRetryUrl('http://localhost:3001/'),
    });

    expect(mail.text).toContain('Não foi possível processar clip.mp4.');
    expect(mail.text).not.toContain('enviado em');
    expect(mail.text).toContain('http://localhost:3001/videos');
  });
});
