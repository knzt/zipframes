import type { RetryOptions } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import { createLogger, runWithCorrelationId } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { startOperationsServer } from '../infrastructure/http/operationsServer.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import {
  CONTACTS_QUEUE,
  CONTACTS_RETRY_QUEUE,
  createNotifierAmqpTopology,
  EMAILS_QUEUE,
  EMAILS_RETRY_QUEUE,
} from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { createAmqpPing } from '../infrastructure/messaging/amqplib/connection.js';
import { recordNotificationOutcome } from '../infrastructure/observability/notificationOutcome.js';
import { createAmqplib } from './factories/externals/amqplib.js';
import { createNodemailer } from './factories/externals/nodemailer.js';
import { createPrisma, createPrismaPing } from './factories/externals/prisma.js';
import { createS3 } from './factories/externals/s3.js';
import { createContactEventsConsumer } from './factories/messaging/contactEventsConsumer.js';
import { createEmailEventsConsumer } from './factories/messaging/emailEventsConsumer.js';

export const startNotifierService = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'notifier-service',
    version: config.serviceVersion,
    level: config.logLevel,
  });
  const technicalMetrics = createMetrics({
    service: 'notifier-service',
    version: config.serviceVersion,
  });
  const retry: RetryOptions = {
    maxAttempts: config.maxAttempts,
    baseDelayMs: config.retryBaseDelayMs,
    maxDelayMs: config.retryMaxDelayMs,
  };

  const closers: (() => Promise<void>)[] = [];

  try {
    const prisma = createPrisma(config.databaseUrl);
    closers.push(() => prisma.$disconnect());

    const amqp = await createAmqplib(config.amqpUrl, 2);
    closers.push(() => amqp.close());
    await amqp.assertTopology(createNotifierAmqpTopology());

    const publicS3 = createS3({
      endpoint: config.s3PublicEndpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    });
    const mail = createNodemailer(config.smtpUrl);

    const shared = {
      prisma,
      mail,
      smtpFrom: config.smtpFrom,
      publicS3,
      bucket: config.s3Bucket,
      appPublicUrl: config.appPublicUrl,
      downloadTtlSeconds: config.downloadUrlTtlSeconds,
      maxAttempts: config.maxAttempts,
    };

    const contacts = createContactEventsConsumer({
      ...shared,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: recordNotificationOutcome({
          logger,
          metrics: technicalMetrics,
          destination: CONTACTS_QUEUE,
        }),
      },
    });
    const emails = createEmailEventsConsumer({
      ...shared,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: recordNotificationOutcome({
          logger,
          metrics: technicalMetrics,
          destination: EMAILS_QUEUE,
        }),
      },
    });

    await amqp.consume(CONTACTS_QUEUE, contacts.handle, {
      retry,
      waitQueue: CONTACTS_RETRY_QUEUE,
    });
    await amqp.consume(EMAILS_QUEUE, emails.handle, {
      retry,
      waitQueue: EMAILS_RETRY_QUEUE,
    });

    const operations = await startOperationsServer({
      port: config.operationsPort,
      isReady: createReadinessCheck([createPrismaPing(prisma), createAmqpPing(amqp)]),
      renderMetrics: () => technicalMetrics.registry.metrics(),
      logger,
    });
    closers.push(() => operations.close());

    logger.info('notifier-service started', {
      contactsQueue: CONTACTS_QUEUE,
      emailsQueue: EMAILS_QUEUE,
      operationsPort: operations.port,
    });

    return {
      stop: async () => {
        await operations.close();
        await amqp.close();
        await prisma.$disconnect();
        logger.info('notifier-service stopped');
      },
    };
  } catch (error) {
    for (const close of [...closers].reverse()) {
      await close().catch(() => undefined);
    }
    throw error;
  }
};
