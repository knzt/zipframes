import { InternalServerError, UnavailableError } from '@zipframes/core';
import { createMetrics, type TechnicalMetrics } from '@zipframes/telemetry';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfirmUploadUseCase } from '../../../../src/application/useCases/confirmUpload/ConfirmUploadUseCase.js';
import { DeleteVideoUseCase } from '../../../../src/application/useCases/deleteVideo/DeleteVideoUseCase.js';
import { GetDownloadUrlUseCase } from '../../../../src/application/useCases/getDownloadUrl/GetDownloadUrlUseCase.js';
import { GetVideoUseCase } from '../../../../src/application/useCases/getVideo/GetVideoUseCase.js';
import { ListUserVideosUseCase } from '../../../../src/application/useCases/listUserVideos/ListUserVideosUseCase.js';
import { RequestUploadUseCase } from '../../../../src/application/useCases/requestUpload/RequestUploadUseCase.js';
import { bindHttpRoutes } from '../../../../src/infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../../../../src/infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../../../../src/infrastructure/http/fastify/server.js';
import { videoRoutes } from '../../../../src/infrastructure/http/routes/videoRoutes.js';
import { ConfirmUploadController } from '../../../../src/interface-adapters/ConfirmUploadController.js';
import { DeleteVideoController } from '../../../../src/interface-adapters/DeleteVideoController.js';
import { GetDownloadUrlController } from '../../../../src/interface-adapters/GetDownloadUrlController.js';
import { GetVideoController } from '../../../../src/interface-adapters/GetVideoController.js';
import { ListUserVideosController } from '../../../../src/interface-adapters/ListUserVideosController.js';
import { RequestUploadController } from '../../../../src/interface-adapters/RequestUploadController.js';
import { bearerFor, fakeAuthenticator } from '../../../support/fake-authenticator.js';
import {
  FakeStorageUrlSigner,
  InMemoryEventPublisher,
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../support/in-memory.js';
import { silentLogger } from '../../../support/silent-logger.js';
import {
  aVideo,
  CORRELATION_ID,
  MAX_UPLOAD_BYTES,
  OTHER_OWNER_ID,
  OWNER_ID,
  VIDEO_ID,
} from '../../../support/videos.js';

const SOURCE_KEY = `uploads/${OWNER_ID}/${VIDEO_ID}`;
const auth = { authorization: bearerFor(OWNER_ID) };

let app: FastifyInstance;
let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let publisher: InMemoryEventPublisher;
let metrics: TechnicalMetrics;
let ready: { ready: true } | { ready: false; reason: string };

beforeEach(async () => {
  videos = new InMemoryVideoRepository();
  storage = new InMemoryObjectStorage();
  publisher = new InMemoryEventPublisher();
  const signer = new FakeStorageUrlSigner();
  const cache = new InMemoryVideoListCache();
  metrics = createMetrics({
    service: 'video-service-test',
    version: '0.0.0',
    collectDefaults: false,
  });
  ready = { ready: true };

  app = await createHttpServer({
    corsOrigin: '*',
    logger: silentLogger(),
    version: '0.0.0',
    metrics,
  });
  bindHttpRoutes(
    app,
    videoRoutes({
      requestUpload: new RequestUploadController(
        new RequestUploadUseCase(videos, signer, cache, MAX_UPLOAD_BYTES, 900),
        fakeAuthenticator,
      ),
      confirmUpload: new ConfirmUploadController(
        new ConfirmUploadUseCase(videos, storage, publisher, cache, MAX_UPLOAD_BYTES),
        fakeAuthenticator,
      ),
      listUserVideos: new ListUserVideosController(
        new ListUserVideosUseCase(videos, cache),
        fakeAuthenticator,
      ),
      getVideo: new GetVideoController(new GetVideoUseCase(videos), fakeAuthenticator),
      getDownloadUrl: new GetDownloadUrlController(
        new GetDownloadUrlUseCase(videos, signer, 300),
        fakeAuthenticator,
      ),
      deleteVideo: new DeleteVideoController(
        new DeleteVideoUseCase(videos, storage, cache),
        fakeAuthenticator,
      ),
    }),
  );
  registerHealthRoutes(app, {
    isReady: () => Promise.resolve(ready),
    renderMetrics: () => metrics.registry.metrics(),
  });
  app.get('/boom/unavailable', () => {
    throw new UnavailableError('DOWN', 'dependency down');
  });
  app.get('/boom/internal', () => {
    throw new InternalServerError('BROKEN', 'secret detail');
  });
  app.get('/boom/unexpected', () => {
    throw new Error('secret detail');
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('authentication', () => {
  it.each([
    ['POST', '/videos'],
    ['POST', `/videos/${VIDEO_ID}/confirm`],
    ['GET', '/videos'],
    ['GET', `/videos/${VIDEO_ID}`],
    ['GET', `/videos/${VIDEO_ID}/download`],
    ['DELETE', `/videos/${VIDEO_ID}`],
  ] as const)('%s %s answers 401 without a valid token', async (method, url) => {
    const missing = await app.inject({ method, url });
    const invalid = await app.inject({ method, url, headers: { authorization: 'Bearer forged' } });

    expect(missing.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(401);
    expect(missing.headers['content-type']).toContain('application/problem+json');
  });
});

describe('POST /videos', () => {
  it('opens the video as the token subject and returns 201 with the upload URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: auth,
      payload: { originalFileName: 'aula.mp4', contentType: 'video/mp4', sizeBytes: 2048 },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ videoId: string; uploadUrl: string; expiresInSeconds: number }>();
    expect(body.expiresInSeconds).toBe(900);
    expect(videos.rows.get(body.videoId)?.ownerId).toBe(OWNER_ID);
  });

  it('answers 400 with the domain message for an unsupported file', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: auth,
      payload: { originalFileName: 'foto.png', contentType: 'image/png', sizeBytes: 2048 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: expect.stringContaining('mp4') as string });
  });

  it('answers 400 for a body the contract rejects', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: auth,
      payload: { originalFileName: 'aula.mp4' },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /videos/:videoId/confirm', () => {
  const confirm = (headers = auth, videoId = VIDEO_ID): Promise<LightMyRequestResponse> =>
    app.inject({
      method: 'POST',
      url: `/videos/${videoId}/confirm`,
      headers: { ...headers, 'x-correlation-id': CORRELATION_ID },
    });

  it('queues the video and publishes with the request correlation id', async () => {
    videos.seed(aVideo('AWAITING_UPLOAD'));
    storage.put(SOURCE_KEY, 2048);

    const response = await confirm();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ videoId: VIDEO_ID, status: 'QUEUED' });
    expect(publisher.published[0]?.correlationId).toBe(CORRELATION_ID);
  });

  it('answers 400 for an id that is not a UUID', async () => {
    expect((await confirm(auth, 'abc')).statusCode).toBe(400);
  });

  it("answers 404 for another owner's video", async () => {
    videos.seed(aVideo('AWAITING_UPLOAD'));

    expect((await confirm({ authorization: bearerFor(OTHER_OWNER_ID) })).statusCode).toBe(404);
  });

  it('answers 409 when nothing was uploaded', async () => {
    videos.seed(aVideo('AWAITING_UPLOAD'));

    expect((await confirm()).statusCode).toBe(409);
  });

  it('answers 503 problem+json when the broker does not confirm', async () => {
    videos.seed(aVideo('AWAITING_UPLOAD'));
    storage.put(SOURCE_KEY, 2048);
    publisher.failWith = new Error('channel closed');

    const response = await confirm();

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 503,
      title: 'the video could not be queued, try again',
      correlationId: CORRELATION_ID,
    });
  });
});

describe('GET /videos', () => {
  beforeEach(() => {
    videos.seed(
      aVideo('DONE', {
        id: '00000000-0000-4000-8000-000000000001',
        createdAt: new Date('2026-09-27T10:01:00Z'),
      }),
      aVideo('QUEUED', {
        id: '00000000-0000-4000-8000-000000000002',
        createdAt: new Date('2026-09-27T10:02:00Z'),
      }),
    );
  });

  it('lists the caller videos with their status', async () => {
    const response = await app.inject({ method: 'GET', url: '/videos', headers: auth });

    expect(response.statusCode).toBe(200);
    expect(
      response.json<{ items: { status: string }[] }>().items.map((item) => item.status),
    ).toEqual(['QUEUED', 'DONE']);
  });

  it('reads limit and before from the query string', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/videos?limit=1&before=2026-09-27T10:02:00.000Z',
      headers: auth,
    });

    expect(response.json<{ items: { videoId: string }[] }>().items).toEqual([
      expect.objectContaining({ videoId: '00000000-0000-4000-8000-000000000001' }),
    ]);
  });

  it.each(['limit=0', 'limit=101', 'before=yesterday'])('answers 400 for %s', async (query) => {
    const response = await app.inject({ method: 'GET', url: `/videos?${query}`, headers: auth });

    expect(response.statusCode).toBe(400);
  });

  it('shows another user an empty list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/videos',
      headers: { authorization: bearerFor(OTHER_OWNER_ID) },
    });

    expect(response.json()).toEqual({ items: [] });
  });
});

describe('GET /videos/:videoId', () => {
  it('returns the status of one video', async () => {
    videos.seed(aVideo('FAILED'));

    const response = await app.inject({ method: 'GET', url: `/videos/${VIDEO_ID}`, headers: auth });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'FAILED',
      failureReason: 'ffmpeg rejected the media file',
    });
  });

  it('answers 404 for an unknown id', async () => {
    const response = await app.inject({ method: 'GET', url: `/videos/${VIDEO_ID}`, headers: auth });

    expect(response.statusCode).toBe(404);
  });
});

describe('GET /videos/:videoId/download', () => {
  const download = (): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/videos/${VIDEO_ID}/download`, headers: auth });

  it('returns the URL of a package inside its window', async () => {
    videos.seed(aVideo('DONE', { expiresAt: new Date(Date.now() + 60_000) }));

    const response = await download();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ videoId: VIDEO_ID, expiresInSeconds: 300 });
  });

  it('answers 409 while processing and 410 once expired', async () => {
    videos.seed(aVideo('PROCESSING'));
    expect((await download()).statusCode).toBe(409);

    videos.seed(aVideo('EXPIRED'));
    expect((await download()).statusCode).toBe(410);
  });
});

describe('DELETE /videos/:videoId', () => {
  it('answers 204 with no body', async () => {
    videos.seed(aVideo('FAILED'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/videos/${VIDEO_ID}`,
      headers: auth,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    expect(videos.rows.get(VIDEO_ID)?.status).toBe('DELETED');
  });

  it('answers 409 while the video is being processed', async () => {
    videos.seed(aVideo('PROCESSING'));

    const response = await app.inject({
      method: 'DELETE',
      url: `/videos/${VIDEO_ID}`,
      headers: auth,
    });

    expect(response.statusCode).toBe(409);
  });
});

describe('server behaviour', () => {
  it('answers problem+json 404 for an unknown route', async () => {
    const response = await app.inject({ method: 'GET', url: '/nothing-here' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ status: 404, title: 'Not found' });
  });

  it('answers 400 for malformed JSON before reaching a controller', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/videos',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{"broken"',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Invalid request' });
  });

  it('keeps the status of a thrown BaseError and hides internal messages', async () => {
    const unavailable = await app.inject({ method: 'GET', url: '/boom/unavailable' });
    const internal = await app.inject({ method: 'GET', url: '/boom/internal' });
    const unexpected = await app.inject({ method: 'GET', url: '/boom/unexpected' });

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ title: 'Internal server error' });
    expect(internal.statusCode).toBe(500);
    expect(unexpected.statusCode).toBe(500);
    expect(unexpected.body).not.toContain('secret detail');
  });

  it('generates a correlation id when the client sends none', async () => {
    const response = await app.inject({ method: 'GET', url: '/videos' });

    expect(response.json<{ correlationId: string }>().correlationId).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('publishes the generated OpenAPI with the bearer scheme and every route', async () => {
    const document = (await app.inject({ method: 'GET', url: '/docs/json' })).json<{
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    }>();

    expect(Object.keys(document.paths).sort()).toEqual(
      expect.arrayContaining([
        '/videos',
        '/videos/{videoId}',
        '/videos/{videoId}/confirm',
        '/videos/{videoId}/download',
      ]),
    );
    expect(document.components.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('counts requests by route pattern, not by URL', async () => {
    await app.inject({ method: 'GET', url: `/videos/${VIDEO_ID}`, headers: auth });

    const text = await metrics.registry.metrics();

    expect(text).toContain('route="/videos/:videoId"');
    expect(text).not.toContain(VIDEO_ID);
  });

  it('reports readiness', async () => {
    expect((await app.inject({ method: 'GET', url: '/health/ready' })).statusCode).toBe(200);
    ready = { ready: false, reason: 'postgres down' };
    const notReady = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(notReady.statusCode).toBe(503);
    expect(notReady.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
    expect((await app.inject({ method: 'GET', url: '/health/live' })).json()).toEqual({
      status: 'ok',
    });
  });
});
