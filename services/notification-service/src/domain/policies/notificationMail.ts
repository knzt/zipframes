export const downloadFallbackPath = (videoId: string): string => `/videos/${videoId}/download`;

export const downloadFallbackUrl = (appPublicUrl: string, videoId: string): string =>
  `${appPublicUrl.replace(/\/$/u, '')}${downloadFallbackPath(videoId)}`;

export const uploadRetryPath = '/videos';

export const uploadRetryUrl = (appPublicUrl: string): string =>
  `${appPublicUrl.replace(/\/$/u, '')}${uploadRetryPath}`;

export const SIGNED_DOWNLOAD_TTL_SECONDS = 24 * 60 * 60;

export const formatUploadDate = (uploadedAt: Date): string => {
  const year = uploadedAt.getUTCFullYear();
  const month = String(uploadedAt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(uploadedAt.getUTCDate()).padStart(2, '0');
  return `${day}/${month}/${String(year)}`;
};

export interface ProcessedMailInput {
  readonly originalFileName: string;
  readonly frameCount: number;
  readonly signedUrl: string;
  readonly fallbackUrl: string;
}

export interface FailedMailInput {
  readonly originalFileName: string;
  readonly retryUrl: string;
  readonly uploadedAt?: Date;
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
    'Se ele falhar, gere um novo em:',
    input.fallbackUrl,
    '',
    'O arquivo expira em 24 horas.',
  ].join('\n'),
});

export const failedMail = (input: FailedMailInput): NotificationMail => {
  const intro =
    input.uploadedAt === undefined
      ? `Não foi possível processar ${input.originalFileName}.`
      : `Não foi possível processar ${input.originalFileName}, enviado em ${formatUploadDate(input.uploadedAt)}.`;
  return {
    subject: `Falha ao processar: ${input.originalFileName}`,
    text: [intro, '', 'Envie de novo em:', input.retryUrl].join('\n'),
  };
};
