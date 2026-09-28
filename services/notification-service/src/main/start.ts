import type { RetryOptions } from '@zipframes/communication';
import { createLogger, runWithCorrelationId } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import {
  createNotificationAmqpTopology,
  NOTIFICATION_QUEUE,
  NOTIFICATION_RETRY_QUEUE,
} from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { recordNotificationOutcome } from '../infrastructure/observability/notificationOutcome.js';
import { createAmqplib } from './factories/externals/amqplib.js';
import { createNodemailer } from './factories/externals/nodemailer.js';
import { createPrisma } from './factories/externals/prisma.js';
import { createS3 } from './factories/externals/s3.js';
import { createNotificationEventsConsumer } from './factories/messaging/notificationEventsConsumer.js';

export const startNotificationService = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'notification-service',
    version: config.serviceVersion,
    level: config.logLevel,
  });
  const technicalMetrics = createMetrics({
    service: 'notification-service',
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

    const amqp = await createAmqplib(config.amqpUrl, 1);
    closers.push(() => amqp.close());
    await amqp.assertTopology(createNotificationAmqpTopology());

    const publicS3 = createS3({
      endpoint: config.s3PublicEndpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    });
    const mail = createNodemailer(config.smtpUrl);

    const consumer = createNotificationEventsConsumer({
      prisma,
      mail,
      smtpFrom: config.smtpFrom,
      publicS3,
      bucket: config.s3Bucket,
      appPublicUrl: config.appPublicUrl,
      downloadTtlSeconds: config.downloadUrlTtlSeconds,
      maxAttempts: config.maxAttempts,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: recordNotificationOutcome({ logger, metrics: technicalMetrics }),
      },
    });

    await amqp.consume(NOTIFICATION_QUEUE, consumer.handle, {
      retry,
      waitQueue: NOTIFICATION_RETRY_QUEUE,
    });

    logger.info('notification-service started', { queue: NOTIFICATION_QUEUE });

    return {
      stop: async () => {
        await amqp.close();
        await prisma.$disconnect();
        logger.info('notification-service stopped');
      },
    };
  } catch (error) {
    for (const close of [...closers].reverse()) {
      await close().catch(() => undefined);
    }
    throw error;
  }
};
