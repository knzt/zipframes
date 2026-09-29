import { NodemailerMailGateway } from '../../../infrastructure/gateways/mail/nodemailerMail.gateway.js';
import type { Nodemailer } from '../externals/nodemailer.js';

export const createMailGateway = (transport: Nodemailer, from: string): NodemailerMailGateway =>
  new NodemailerMailGateway(transport, from);
