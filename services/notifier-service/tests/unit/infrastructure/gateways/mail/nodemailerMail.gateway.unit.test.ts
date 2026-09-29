import { describe, expect, it, vi } from 'vitest';

import { UnavailableError } from '@zipframes/core';

import { NodemailerMailGateway } from '../../../../../src/infrastructure/gateways/mail/nodemailerMail.gateway.js';

describe('NodemailerMailGateway', () => {
  it('sends text mail from the configured address', async () => {
    const sendMail = vi.fn(async () => undefined);
    const gateway = new NodemailerMailGateway(
      { sendMail } as never,
      'ZipFrames <noreply@zipframes.local>',
    );

    await gateway.send({
      to: 'ada@example.com',
      subject: 'ready',
      text: 'zip is ready',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'ZipFrames <noreply@zipframes.local>',
      to: 'ada@example.com',
      subject: 'ready',
      text: 'zip is ready',
    });
  });

  it('wraps SMTP failures', async () => {
    const gateway = new NodemailerMailGateway(
      {
        sendMail: async () => {
          throw new Error('down');
        },
      } as never,
      'noreply@zipframes.local',
    );

    await expect(
      gateway.send({ to: 'ada@example.com', subject: 'x', text: 'y' }),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
