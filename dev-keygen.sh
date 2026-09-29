#!/bin/sh
# Generates the local development JWT key when it is missing. The cluster does
# the same in infra/kind/bootstrap.sh; neither key is committed.
#
# Compose bind-mounts this file. Docker creates a directory in its place when
# it does not exist, so this has to run before `docker compose up`.
set -e

KEY=infra/docker-compose/auth/jwt-dev.pem

if [ -f "$KEY" ]; then
  exit 0
fi

mkdir -p "$(dirname "$KEY")"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$KEY" 2> /dev/null
echo "generated $KEY"
