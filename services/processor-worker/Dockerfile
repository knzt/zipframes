FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY dist ./dist
# Copies the production modules staged by `pnpm stage-runtime`.
COPY .runtime/node_modules ./node_modules

ENV NODE_ENV=production
CMD ["node", "dist/main/index.js"]
