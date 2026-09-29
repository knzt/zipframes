import nodemailer from 'nodemailer';

export const createNodemailer = (smtpUrl: string): nodemailer.Transporter =>
  nodemailer.createTransport(smtpUrl);

export type Nodemailer = ReturnType<typeof createNodemailer>;
