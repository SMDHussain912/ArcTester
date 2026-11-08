FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
COPY web/package.json ./web/package.json
RUN npm ci

COPY . .
RUN npm run prisma:generate --workspace=api
RUN npm run build:api

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/package.json ./api/package.json
COPY --from=build /app/api/dist ./api/dist
COPY --from=build /app/api/prisma ./api/prisma

RUN mkdir -p /app/api/prisma/data && chown -R node:node /app/api
USER node

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema=api/prisma/schema.prisma && npm run prisma:seed --workspace=api && node api/dist/index.js"]
