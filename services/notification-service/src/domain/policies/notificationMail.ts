export const downloadFallbackPath = (videoId: string): string => `/videos/${videoId}/download`;

export const downloadFallbackUrl = (appPublicUrl: string, videoId: string): string =>
  `${appPublicUrl.replace(/\/$/u, '')}${downloadFallbackPath(videoId)}`;

export const SIGNED_DOWNLOAD_TTL_SECONDS = 24 * 60 * 60;

export interface ProcessedMailInput {
  readonly originalFileName: string;
  readonly frameCount: number;
  readonly signedUrl: string;
  readonly fallbackUrl: string;
}

export interface FailedMailInput {
  readonly originalFileName: string;
  readonly reason: string;
}

export interface NotificationMail {
  readonly subject: string;
  readonly text: string;
}

export const processedMail = (input: ProcessedMailInput): NotificationMail => ({
  subject: `Seu zip está pronto: ${input.originalFileName}`,
  text: [
    `O pacote de frames do arquivo ${input.originalFileName} está pronto (${String(input.frameCount)} frames).`,
    '',
    'Baixe o zip:',
    input.signedUrl,
    '',
    'O link vale 24 horas. Se ele falhar, gere um novo em:',
    input.fallbackUrl,
    '(autenticação JWT Bearer)',
  ].join('\n'),
});

export const failedMail = (input: FailedMailInput): NotificationMail => ({
  subject: `Falha ao processar: ${input.originalFileName}`,
  text: [
    `Não foi possível processar ${input.originalFileName}.`,
    '',
    `Motivo: ${input.reason}`,
  ].join('\n'),
});
