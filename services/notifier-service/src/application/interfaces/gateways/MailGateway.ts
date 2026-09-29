export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface MailGateway {
  send: (message: MailMessage) => Promise<void>;
}
