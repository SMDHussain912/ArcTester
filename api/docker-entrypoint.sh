#!/bin/sh
set -eu

npx prisma migrate deploy --schema=api/prisma/schema.prisma
npm run prisma:seed --workspace=api
exec node api/dist/index.js
