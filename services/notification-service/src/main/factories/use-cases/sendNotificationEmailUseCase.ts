import { SendNotificationEmailUseCase } from '../../../application/useCases/sendNotificationEmail/SendNotificationEmailUseCase.js';
import type { Nodemailer } from '../externals/nodemailer.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createMailGateway } from '../gateways/mailGateway.js';
import { createObjectStorageGateway } from '../gateways/objectStorageGateway.js';
import { createContactRepository } from '../repositories/contactRepository.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';

export interface SendNotificationEmailExternalDeps {
  readonly prisma: Prisma;
  readonly mail: Nodemailer;
  readonly smtpFrom: string;
  readonly publicS3: S3;
  readonly bucket: string;
  readonly appPublicUrl: string;
  readonly downloadTtlSeconds: number;
  readonly maxAttempts: number;
}

export const createSendNotificationEmailUseCase = (
  externalDeps: SendNotificationEmailExternalDeps,
): SendNotificationEmailUseCase =>
  new SendNotificationEmailUseCase(
    createNotificationRepository(externalDeps.prisma),
    createContactRepository(externalDeps.prisma),
    createMailGateway(externalDeps.mail, externalDeps.smtpFrom),
    createObjectStorageGateway(externalDeps.publicS3, externalDeps.bucket),
    externalDeps.appPublicUrl,
    externalDeps.downloadTtlSeconds,
    externalDeps.maxAttempts,
  );
