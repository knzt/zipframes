import { UnavailableError } from '@zipframes/core';
import type { Transporter } from 'nodemailer';

import type {
  MailGateway,
  MailMessage,
} from '../../../application/interfaces/gateways/MailGateway.js';

export class NodemailerMailGateway implements MailGateway {
  constructor(
    private readonly transport: Transporter,
    private readonly from: string,
  ) {}

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    } catch (error) {
      throw new UnavailableError('SMTP_SEND_FAILED', `failed to send mail to ${message.to}`, {
        cause: error,
      });
    }
  }
}
