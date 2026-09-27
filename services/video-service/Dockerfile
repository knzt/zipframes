FROM node:26-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.6.0 --allow-scripts=pnpm

# Context is the repository root so tsconfig.base.json is available.
# Ignore rules for that context are the root .dockerignore.
# The install uses only this service's lockfile.
WORKDIR /src
COPY tsconfig.base.json ./tsconfig.base.json
COPY services/video-service/package.json services/video-service/pnpm-lock.yaml services/video-service/pnpm-workspace.yaml services/video-service/.npmrc services/video-service/

# pnpm 12 ignores ${NODE_AUTH_TOKEN} in a committed .npmrc. The secret is
# written only for this command and removed in the same layer.
RUN --mount=type=secret,id=node_auth_token \
    printf '%s\n' "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/node_auth_token)" > /root/.npmrc \
    && pnpm --dir services/video-service install --frozen-lockfile \
    && rm -f /root/.npmrc

COPY services/video-service/tsconfig.json services/video-service/tsconfig.build.json services/video-service/
COPY services/video-service/src services/video-service/src

WORKDIR /src/services/video-service
RUN pnpm exec prisma generate \
  && pnpm exec tsc -p tsconfig.build.json \
  && pnpm prune --prod

FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /src/services/video-service/node_modules ./node_modules
COPY --from=build /src/services/video-service/dist ./dist
COPY --from=build /src/services/video-service/src/infrastructure/repositories/prisma/schema.prisma ./src/infrastructure/repositories/prisma/schema.prisma
COPY --from=build /src/services/video-service/src/infrastructure/repositories/prisma/migrations ./src/infrastructure/repositories/prisma/migrations
COPY --from=build /src/services/video-service/package.json ./

CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main/index.js"]
