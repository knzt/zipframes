#!/usr/bin/env bash
# Cloud Agent bootstrap for the ZipFrames workspace.
# Idempotent: installs dependencies for the app monorepo, the shared packages
# monorepo, and each service. Safe to re-run.
set -eu

# The repos are checked out side by side under /agent/repos.
ZF=/agent/repos/zipframes
ZFP=/agent/repos/zipframes-packages

# Use the pinned Node toolchain. Node 22 ships corepack (the pinned
# pnpm@10.33.0 / pnpm@12.6.0 are provisioned through it); Node 25+ dropped
# corepack, so we deliberately stay on the toolchain baked into the base image.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use default >/dev/null 2>&1 || true
corepack enable >/dev/null 2>&1 || true
echo "node: $(node -v)  pnpm(default): $(pnpm -v)"

# Auth for the private @zipframes/* packages on GitHub Packages. The line
# references the NODE_AUTH_TOKEN secret so the token is resolved at runtime and
# never written into the environment snapshot.
NPMRC="$HOME/.npmrc"
grep -q "npm.pkg.github.com/:_authToken" "$NPMRC" 2>/dev/null \
  || echo '//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}' >> "$NPMRC"

# Shared packages monorepo (pnpm@10.33.0 via corepack): install + build.
( cd "$ZFP" && pnpm install --frozen-lockfile && pnpm build )

# App monorepo root tooling (pnpm@12.6.0 via corepack).
( cd "$ZF" && pnpm install --frozen-lockfile )

# Service dependencies pull the private @zipframes/* packages, so they need the
# registry token. Install them when it is available (e.g. agent runtime) and
# skip gracefully otherwise so a token-less build still succeeds.
if [ -n "${NODE_AUTH_TOKEN:-}" ]; then
  ( cd "$ZF/services/auth-service" && pnpm install --frozen-lockfile && pnpm db:generate )
  ( cd "$ZF/services/processor-worker" && pnpm install --frozen-lockfile )
else
  echo "NODE_AUTH_TOKEN not set; skipping @zipframes/* service dependency install."
fi

echo "install: done"
