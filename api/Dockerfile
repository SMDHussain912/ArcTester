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
COPY --from=build /app/api/docker-entrypoint.sh ./api/docker-entrypoint.sh

RUN chown -R node:node /app/api
USER node

EXPOSE 4000
CMD ["sh", "api/docker-entrypoint.sh"]
