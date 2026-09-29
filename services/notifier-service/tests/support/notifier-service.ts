import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { startPostgres, startRabbitMq, startS3 } from '@zipframes/test-toolkit';
import type { PostgresHandle, RabbitMqHandle, S3Handle } from '@zipframes/test-toolkit';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

import { createPrisma, type Prisma } from '../../src/main/factories/externals/prisma.js';
import { startNotifierService } from '../../src/main/start.js';

const execFileAsync = promisify(execFile);

export const BUCKET = 'videos';

export interface MailpitHandle {
  readonly smtpUrl: string;
  readonly apiUrl: string;
  readonly stop: () => Promise<void>;
}

export interface NotifierServiceUnderTest {
  readonly amqpUri: string;
  readonly prisma: Prisma;
  readonly s3: S3Client;
  readonly s3Endpoint: string;
  readonly mailpitApiUrl: string;
  readonly stop: () => Promise<void>;
}

const startMailpit = async (): Promise<MailpitHandle> => {
  const container: StartedTestContainer = await new GenericContainer('axllent/mailpit:v1.24')
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(90_000)
    .start();
  const host = container.getHost();
  const smtpPort = container.getMappedPort(1025);
  const webPort = container.getMappedPort(8025);
  return {
    smtpUrl: `smtp://${host}:${String(smtpPort)}`,
    apiUrl: `http://${host}:${String(webPort)}`,
    stop: async () => {
      await container.stop();
    },
  };
};

export const startNotifierServiceUnderTest = async (): Promise<NotifierServiceUnderTest> => {
  const [postgres, rabbit, objectStore, mailpit]: [
    PostgresHandle,
    RabbitMqHandle,
    S3Handle,
    MailpitHandle,
  ] = await Promise.all([startPostgres(), startRabbitMq(), startS3(), startMailpit()]);

  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../../'),
    env: { ...process.env, NOTIFICATION_DATABASE_URL: postgres.connectionUri },
    shell: process.platform === 'win32',
  });

  const s3 = new S3Client({
    endpoint: objectStore.endpoint,
    region: objectStore.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: objectStore.accessKey,
      secretAccessKey: objectStore.secretKey,
    },
  });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));

  Object.assign(process.env, {
    NOTIFICATION_DATABASE_URL: postgres.connectionUri,
    AMQP_URL: rabbit.amqpUri,
    SMTP_URL: mailpit.smtpUrl,
    SMTP_FROM: 'ZipFrames <noreply@zipframes.local>',
    S3_ENDPOINT: objectStore.endpoint,
    S3_PUBLIC_ENDPOINT: objectStore.endpoint,
    S3_ACCESS_KEY: objectStore.accessKey,
    S3_SECRET_KEY: objectStore.secretKey,
    S3_REGION: objectStore.region,
    S3_BUCKET: BUCKET,
    S3_FORCE_PATH_STYLE: 'true',
    APP_PUBLIC_URL: 'http://localhost:3001',
    MAX_ATTEMPTS: '3',
    RETRY_BASE_DELAY_MS: '50',
    RETRY_MAX_DELAY_MS: '200',
    DOWNLOAD_URL_TTL_SECONDS: '86400',
    LOG_LEVEL: 'error',
    SERVICE_VERSION: '0.1.0',
  });

  const service = await startNotifierService();
  const prisma = createPrisma(postgres.connectionUri);

  return {
    amqpUri: rabbit.amqpUri,
    prisma,
    s3,
    s3Endpoint: objectStore.endpoint,
    mailpitApiUrl: mailpit.apiUrl,
    stop: async () => {
      await service.stop();
      await prisma.$disconnect();
      await Promise.all([postgres.stop(), rabbit.stop(), objectStore.stop(), mailpit.stop()]);
    },
  };
};

export const putZipObject = async (
  s3: S3Client,
  key: string,
  body = Buffer.from('PK\u0003\u0004zip'),
): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: 'application/zip',
    }),
  );
};

export interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
}

export interface MailpitMessageBody {
  readonly Text: string;
  readonly Subject: string;
}

export const pollMailpit = async (
  apiUrl: string,
  subjectIncludes: string,
): Promise<MailpitMessageBody> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const list = (await fetch(`${apiUrl}/api/v1/messages`).then((response) => response.json())) as {
      readonly messages?: readonly MailpitMessage[];
    };
    const match = list.messages?.find((message) => message.Subject.includes(subjectIncludes));
    if (match !== undefined) {
      return (await fetch(`${apiUrl}/api/v1/message/${match.ID}`).then((response) =>
        response.json(),
      )) as MailpitMessageBody;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`timed out waiting for mail subject ${subjectIncludes}`);
};
