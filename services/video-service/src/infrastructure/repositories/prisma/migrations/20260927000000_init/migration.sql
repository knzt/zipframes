-- Matches docs/data/modelagem-de-dados.md's video-db DDL. The CHECK
-- constraints and the two partial indexes are written by hand: Prisma's
-- schema DSL cannot express them, and they are what keeps every write path
-- inside the aggregate's invariants.

CREATE TYPE "video_status" AS ENUM (
  'AWAITING_UPLOAD',
  'QUEUED',
  'PROCESSING',
  'DONE',
  'FAILED',
  'EXPIRED',
  'DELETED'
);

CREATE TABLE "videos" (
  "id"                 uuid           PRIMARY KEY,
  "owner_id"           uuid           NOT NULL,
  "original_file_name" varchar(255)   NOT NULL,
  "content_type"       varchar(100)   NOT NULL,
  "size_bytes"         bigint         NOT NULL CHECK ("size_bytes" > 0),
  "source_key"         varchar(512)   NOT NULL,
  "result_key"         varchar(512),
  "frame_count"        integer        CHECK ("frame_count" IS NULL OR "frame_count" > 0),
  "status"             "video_status" NOT NULL DEFAULT 'AWAITING_UPLOAD',
  "error_code"         varchar(50),
  "failure_reason"     text,
  "expires_at"         timestamptz,
  "source_purged_at"   timestamptz,
  "result_purged_at"   timestamptz,
  "created_at"         timestamptz    NOT NULL DEFAULT now(),
  "updated_at"         timestamptz    NOT NULL DEFAULT now(),
  "version"            integer        NOT NULL DEFAULT 0,
  CONSTRAINT "ck_videos_done"        CHECK ("status" <> 'DONE' OR ("result_key" IS NOT NULL AND "frame_count" > 0 AND "expires_at" IS NOT NULL)),
  CONSTRAINT "ck_videos_failed"      CHECK ("status" <> 'FAILED' OR "failure_reason" IS NOT NULL),
  CONSTRAINT "ck_videos_sem_arquivo" CHECK ("status" NOT IN ('EXPIRED', 'DELETED') OR "result_key" IS NULL)
);

CREATE UNIQUE INDEX "uq_videos_source_key" ON "videos" ("source_key");

CREATE INDEX "idx_videos_owner" ON "videos" ("owner_id", "created_at" DESC);

-- Hand-written: monitoring and detection of stuck videos only look at these two statuses.
CREATE INDEX "idx_videos_em_andamento" ON "videos" ("status", "created_at")
  WHERE "status" IN ('QUEUED', 'PROCESSING');

-- Hand-written: the expiration sweep only looks at finished packages.
CREATE INDEX "idx_videos_a_expirar" ON "videos" ("expires_at")
  WHERE "status" = 'DONE';
