#!/bin/sh
set -eu

if [ "${SKIP_PRISMA_MIGRATE:-false}" != "true" ]; then
  npx prisma migrate deploy
fi

exec "$@"
