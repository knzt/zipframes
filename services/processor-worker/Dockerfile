FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
COPY services/processor-worker/package.json services/processor-worker/

RUN corepack enable && pnpm install --filter @zipframes/processor-worker --frozen-lockfile

COPY services/processor-worker services/processor-worker

RUN pnpm --filter @zipframes/processor-worker build

ENV NODE_ENV=production
WORKDIR /app/services/processor-worker
CMD ["node", "dist/main/index.js"]
