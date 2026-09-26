import type { S3Client } from '@aws-sdk/client-s3';
import type { Logger } from '@zipframes/logger';
import type { TechnicalMetrics } from '@zipframes/telemetry';

import { ProcessUploadedVideoUseCase } from '../../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import type { WorkerConfig } from '../../../infrastructure/loadEnvConfig.js';
import type { RabbitMqConnection } from '../../../infrastructure/messaging/rabbitmqConnection.js';
import { UPLOADED_QUEUE } from '../../../infrastructure/messaging/topology.js';
import { createEventPublisher } from '../gateways/eventPublisher.js';
import { createFrameExtractor } from '../gateways/frameExtractor.js';
import { createObjectStorage } from '../gateways/objectStorage.js';
import { createArchiveBuilder } from '../services/archiveBuilder.js';
import { createWorkDirectory } from '../services/workDirectory.js';

export interface ProcessUploadedVideoExternals {
  readonly connection: RabbitMqConnection;
  readonly s3: S3Client;
  readonly config: WorkerConfig;
  readonly logger: Logger;
  readonly technicalMetrics: TechnicalMetrics;
}

export const createProcessUploadedVideo = (
  externals: ProcessUploadedVideoExternals,
): ProcessUploadedVideoUseCase =>
  new ProcessUploadedVideoUseCase({
    storage: createObjectStorage(externals.s3, externals.config.s3Bucket),
    extractor: createFrameExtractor(),
    archive: createArchiveBuilder(),
    workDirectory: createWorkDirectory(externals.config.workDir),
    events: createEventPublisher(externals.connection),
    processingTimeoutMs: externals.config.processingTimeoutMs,
    onDiscardOriginalFailed: (job, error) => {
      externals.logger.error('failed to discard original object after processing', {
        videoId: job.videoId,
        sourceKey: job.sourceKey,
        errorCode: error instanceof Error ? error.message : 'unknown',
      });
      externals.technicalMetrics.messagesHandledTotal.inc({
        destination: UPLOADED_QUEUE,
        outcome: 'delete_original_failed',
      });
    },
  });
