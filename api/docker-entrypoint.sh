#!/bin/sh
set -eu

# Use the installed workspace binaries directly. The production image contains
# the API package and node_modules, not the full monorepo workspace manifests.
./node_modules/.bin/prisma migrate deploy --schema=api/prisma/schema.prisma
./node_modules/.bin/tsx api/prisma/seed.ts
exec node api/dist/index.js
