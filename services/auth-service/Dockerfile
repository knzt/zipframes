FROM node:26-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@12.6.0 --allow-scripts=pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY services/auth-service/package.json services/auth-service/package.json
COPY services/processor-worker/package.json services/processor-worker/package.json

# pnpm 12 ignores ${NODE_AUTH_TOKEN} in a committed .npmrc. The secret is
# written only for this command and removed in the same layer.
RUN --mount=type=secret,id=node_auth_token \
    printf '%s\n' "//npm.pkg.github.com/:_authToken=$(cat /run/secrets/node_auth_token)" > /root/.npmrc \
    && pnpm install --frozen-lockfile --filter @zipframes/auth-service... \
    && rm -f /root/.npmrc

COPY services/auth-service ./services/auth-service

RUN pnpm --filter @zipframes/auth-service exec prisma generate \
  && pnpm --filter @zipframes/auth-service exec tsc -p tsconfig.build.json \
  && pnpm --filter @zipframes/auth-service --prod deploy /out \
  && cp -a services/auth-service/dist /out/dist \
  && cd /out && node node_modules/prisma/build/index.js generate

FROM node:26-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /out ./

CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node dist/main/index.js"]
